import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@ota/db';
import {
  EMERGENCY_SEVERITY,
  JOB_STATUSES,
  JOB_STEP_CLOCK_TOLERANCE_MS,
  ServiceItemStatus,
  finishesJob,
  jobStepRefusal,
  jobStepsOpen,
  type JobServiceType,
  type JobStep,
  type JobStepRefusal,
} from '@ota/domain';
import type {
  EmergencyReportResultDto,
  JobBriefDto,
  JobStepTimesDto,
  RecordJobStepRequest,
  ReportEmergencyRequest,
  ServiceItemBriefRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import {
  ESCALATION_PUBLISHER,
  type EscalationPublisher,
} from '../escalation/escalation.publisher';
import { PrismaService } from '../prisma/prisma.service';
import { jobStepTimes, toJobStepTimesDto } from './job-steps';

/** Which column holds each step's time (J2). */
const STEP_COLUMN = {
  EN_ROUTE: 'enRouteAt',
  ARRIVED: 'arrivedAt',
  STARTED: 'startedAt',
  FINISHED: 'finishedAt',
} as const satisfies Record<JobStep, keyof Prisma.ServiceItemUncheckedUpdateInput>;

const JOB_SELECT = {
  id: true,
  supplierId: true,
  serviceType: true,
  status: true,
  respondedAt: true,
  reservationId: true,
  enRouteAt: true,
  arrivedAt: true,
  startedAt: true,
  finishedAt: true,
  reservation: { select: { status: true } },
} satisfies Prisma.ServiceItemSelect;

type JobRow = Prisma.ServiceItemGetPayload<{ select: typeof JOB_SELECT }>;

const STEP_REFUSAL_MESSAGE: Record<JobStepRefusal, string> = {
  not_for_type: 'This service does not use that step',
  in_future: 'The step is timed after now',
  before_acceptance: 'The step is timed before the job was accepted',
  later_step_recorded: 'A later step is already recorded',
};

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * W-Job (`docs/schema-w-job.md`, approved J1–J9): the steps a worker taps on
 * a job (or the desk records after a call), the worker's on-site emergency
 * report, and the desk's brief for the worker. Every write is audited; an
 * emergency is broadcast to the desk on `/ops`.
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ESCALATION_PUBLISHER) private readonly escalation: EscalationPublisher,
  ) {}

  /** A step the worker tapped on one of their own jobs. */
  async workerStep(
    actor: AuthUser,
    serviceItemId: string,
    input: RecordJobStepRequest,
    now: Date = new Date(),
  ): Promise<JobStepTimesDto> {
    const item = await this.ownJob(actor, serviceItemId);
    return this.recordStep(item, input, now, actor, 'app');
  }

  /** A step the desk records for the worker, after a call (J4). */
  async deskStep(
    actor: AuthUser,
    serviceItemId: string,
    input: RecordJobStepRequest,
    now: Date = new Date(),
  ): Promise<JobStepTimesDto> {
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
      select: JOB_SELECT,
    });
    if (!item) throw new NotFoundException(`Service item ${serviceItemId} not found`);
    if (!item.supplierId || !JOB_STATUSES.includes(item.status as ServiceItemStatus)) {
      throw new ConflictException('No worker has taken this service');
    }
    return this.recordStep(item, input, now, actor, 'desk');
  }

  /**
   * The worker's on-site emergency (J5, J6): an incident in the duty-of-care
   * log and a red alert on every open desk. A report sent again (the same
   * `clientRef`) returns the first.
   */
  async reportEmergency(
    actor: AuthUser,
    serviceItemId: string,
    input: ReportEmergencyRequest,
    now: Date = new Date(),
  ): Promise<EmergencyReportResultDto> {
    const item = await this.ownJob(actor, serviceItemId);
    const known = await this.knownReport(input.clientRef, item.supplierId!);
    if (known) return known;

    const told = new Date(input.occurredAt);
    const occurredAt =
      told.getTime() > now.getTime() + JOB_STEP_CLOCK_TOLERANCE_MS ? now : told;
    let incident: { id: string; createdAt: Date };
    try {
      incident = await this.prisma.incident.create({
        data: {
          reservationId: item.reservationId,
          serviceItemId: item.id,
          supplierId: item.supplierId,
          category: input.category,
          description: '',
          severity: EMERGENCY_SEVERITY,
          source: 'WORKER_APP',
          latitude: input.position?.latitude ?? null,
          longitude: input.position?.longitude ?? null,
          locationAccuracyM:
            input.position?.accuracyM == null
              ? null
              : Math.round(input.position.accuracyM),
          occurredAt,
          clientRef: input.clientRef,
        },
        select: { id: true, createdAt: true },
      });
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
      const raced = await this.knownReport(input.clientRef, item.supplierId!);
      if (raced) return raced;
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'incident.reported',
        entityType: 'Incident',
        entityId: incident.id,
        metadata: {
          reservationId: item.reservationId,
          serviceItemId: item.id,
          category: input.category,
          hasPosition: input.position !== null,
        },
      },
    });
    this.escalation.publish({
      type: 'incident.emergency',
      incidentId: incident.id,
      reservationId: item.reservationId,
      serviceItemId: item.id,
      occurredAt: occurredAt.toISOString(),
    });
    return { incidentId: incident.id, createdAt: incident.createdAt.toISOString() };
  }

  /**
   * The desk's brief for one service (J1). An absent field is kept, an empty
   * one cleared. The audit names the fields changed, not their text, which
   * may hold a traveler's health details.
   */
  async updateBrief(
    actor: AuthUser,
    serviceItemId: string,
    input: ServiceItemBriefRequest,
  ): Promise<JobBriefDto> {
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
      select: { id: true, reservationId: true },
    });
    if (!item) throw new NotFoundException(`Service item ${serviceItemId} not found`);
    const data: Prisma.ServiceItemUpdateInput = {};
    if (input.meetingPoint !== undefined) data.meetingPoint = input.meetingPoint;
    if (input.dropOff !== undefined) data.dropOff = input.dropOff;
    if (input.workerBrief !== undefined) data.workerBrief = input.workerBrief;
    const row = await this.prisma.serviceItem.update({
      where: { id: serviceItemId },
      data,
      select: { meetingPoint: true, dropOff: true, workerBrief: true },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'service_item.brief_updated',
        entityType: 'ServiceItem',
        entityId: serviceItemId,
        metadata: { reservationId: item.reservationId, fields: Object.keys(data) },
      },
    });
    return row;
  }

  /** One of the caller's own taken jobs, or a refusal the app shows as gone. */
  private async ownJob(actor: AuthUser, serviceItemId: string): Promise<JobRow> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
      select: JOB_SELECT,
    });
    if (!item || item.supplierId !== profile.id) {
      throw new NotFoundException(`Service item ${serviceItemId} not found`);
    }
    if (!JOB_STATUSES.includes(item.status as ServiceItemStatus)) {
      throw new ConflictException('This job is no longer yours');
    }
    return item;
  }

  private async knownReport(
    clientRef: string,
    supplierId: string,
  ): Promise<EmergencyReportResultDto | null> {
    const known = await this.prisma.incident.findUnique({
      where: { clientRef },
      select: { id: true, createdAt: true, supplierId: true },
    });
    if (!known) return null;
    if (known.supplierId !== supplierId) {
      throw new ConflictException('That report id is taken');
    }
    return { incidentId: known.id, createdAt: known.createdAt.toISOString() };
  }

  /**
   * Records a step once (J2): a step already in returns its first time; the
   * write is guarded on the column still being empty, so two at once record
   * one. The last step also marks the item `FULFILLED` (J3).
   */
  private async recordStep(
    item: JobRow,
    input: RecordJobStepRequest,
    now: Date,
    actor: AuthUser,
    via: 'app' | 'desk',
  ): Promise<JobStepTimesDto> {
    if (!jobStepsOpen(item.reservation.status)) {
      throw new ConflictException('The booking is not confirmed or under way');
    }
    const times = jobStepTimes(item);
    if (times[input.step]) return toJobStepTimesDto(times);
    const at = new Date(input.occurredAt);
    const refusal = jobStepRefusal({
      step: input.step,
      serviceType: item.serviceType as JobServiceType,
      at,
      now,
      acceptedAt: item.respondedAt,
      times,
    });
    if (refusal === 'later_step_recorded') {
      throw new ConflictException(STEP_REFUSAL_MESSAGE[refusal]);
    }
    if (refusal) throw new UnprocessableEntityException(STEP_REFUSAL_MESSAGE[refusal]);

    const column = STEP_COLUMN[input.step];
    const { count } = await this.prisma.serviceItem.updateMany({
      where: { id: item.id, [column]: null },
      data: {
        [column]: at,
        ...(finishesJob(input.step) ? { status: ServiceItemStatus.Fulfilled } : {}),
      },
    });
    const fresh = await this.prisma.serviceItem.findUniqueOrThrow({
      where: { id: item.id },
      select: JOB_SELECT,
    });
    if (count > 0) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'service_item.step_recorded',
          entityType: 'ServiceItem',
          entityId: item.id,
          metadata: {
            reservationId: item.reservationId,
            step: input.step,
            occurredAt: at.toISOString(),
            via,
          },
        },
      });
    }
    return toJobStepTimesDto(jobStepTimes(fresh));
  }
}
