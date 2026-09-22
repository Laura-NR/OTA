import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  Prisma,
  Reservation,
  ServiceItem,
  SupplierCategory as PrismaSupplierCategory,
  SupplierProfile,
} from '@ota/db';
import {
  ReservationStatus,
  SERVICE_TYPE_TO_SUPPLIER_CATEGORIES,
  ServiceItemStatus,
  assertTransition,
  canAutoDispatch,
  canTransition,
  coversProvince,
  escalationAlert,
  resolveDispatchTimeoutMs,
  type ServiceType,
  type SupplierCategory,
} from '@ota/domain';
import type {
  DispatchCandidateDto,
  DispatchServiceItemDto,
  DispatchViewDto,
  ReassignServiceItemRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import {
  ESCALATION_PUBLISHER,
  type EscalationPublisher,
} from '../escalation/escalation.publisher';
import { PrismaService } from '../prisma/prisma.service';
import { DISPATCH_SCHEDULER, type DispatchScheduler } from './dispatch.scheduler';

const VERIFIED = 'VERIFIED';

type ServiceItemWithSupplier = ServiceItem & { supplier: SupplierProfile | null };
type ReservationWithItems = Reservation & { serviceItems: ServiceItemWithSupplier[] };

@Injectable()
export class DispatchService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DISPATCH_SCHEDULER) private readonly scheduler: DispatchScheduler,
    @Inject(ESCALATION_PUBLISHER) private readonly escalation: EscalationPublisher,
  ) {}

  onModuleInit(): void {
    this.scheduler.setTimeoutHandler((serviceItemId) =>
      this.handleTimeout(serviceItemId),
    );
  }

  /** Start or resume dispatch for every unassigned service item. */
  async startDispatch(reservationId: string, actor: AuthUser): Promise<DispatchViewDto> {
    const reservation = await this.loadReservation(reservationId);

    if (reservation.serviceItems.length === 0) {
      throw new ConflictException('Reservation has no service items to dispatch');
    }

    if (reservation.status !== ReservationStatus.DispatchInProgress) {
      assertTransition(
        reservation.status as ReservationStatus,
        ReservationStatus.DispatchInProgress,
      );
      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.DispatchInProgress },
      });
      await this.audit(actor, reservationId, 'reservation.dispatch_started', {
        from: reservation.status,
      });
    }

    for (const item of reservation.serviceItems) {
      if (
        item.status === ServiceItemStatus.Unassigned ||
        item.status === ServiceItemStatus.Declined ||
        item.status === ServiceItemStatus.Timeout
      ) {
        await this.offerToNextCandidate(item, actor);
      }
    }

    return this.getView(reservationId);
  }

  async getView(reservationId: string): Promise<DispatchViewDto> {
    const reservation = await this.loadReservation(reservationId);
    const now = new Date();

    return {
      reservationId: reservation.id,
      bookingCode: reservation.bookingCode,
      status: reservation.status as ReservationStatus,
      serviceItems: reservation.serviceItems.map((item) => this.toItemDto(item, now)),
    };
  }

  /**
   * Every reservation currently in the dispatch/escalation flow, for the live
   * operations dashboard (spec §4.3).
   */
  async listActive(): Promise<DispatchViewDto[]> {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: {
          in: [
            ReservationStatus.DispatchInProgress,
            ReservationStatus.AssemblyAndEscalation,
            ReservationStatus.ActionRequired,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      include: { serviceItems: { include: { supplier: true } } },
    });

    const now = new Date();
    return reservations.map((reservation) => ({
      reservationId: reservation.id,
      bookingCode: reservation.bookingCode,
      status: reservation.status as ReservationStatus,
      serviceItems: reservation.serviceItems.map((item) => this.toItemDto(item, now)),
    }));
  }

  async accept(serviceItemId: string, actor: AuthUser): Promise<DispatchViewDto> {
    const item = await this.loadItemForWorker(serviceItemId, actor);
    this.assertOpenForResponse(item);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceItem.update({
        where: { id: item.id },
        data: { status: ServiceItemStatus.Accepted, respondedAt: now },
      });
      await tx.dispatchOffer.updateMany({
        where: { serviceItemId: item.id, status: 'OFFERED' },
        data: { status: 'ACCEPTED', respondedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'dispatch.accept',
          entityType: 'ServiceItem',
          entityId: item.id,
        },
      });
    });

    await this.scheduler.cancelTimeout(item.id);
    await this.advanceIfFullyAccepted(item.reservationId, actor);

    this.escalation.publish({
      type: 'dispatch.accept',
      alert: 'NONE',
      reservationId: item.reservationId,
      serviceItemId: item.id,
      supplierId: item.supplierId,
      province: item.province,
      workerPhone: null,
      occurredAt: now.toISOString(),
    });

    return this.getView(item.reservationId);
  }

  async decline(
    serviceItemId: string,
    reason: string,
    actor: AuthUser,
  ): Promise<DispatchViewDto> {
    const item = await this.loadItemForWorker(serviceItemId, actor);
    this.assertOpenForResponse(item);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceItem.update({
        where: { id: item.id },
        data: {
          status: ServiceItemStatus.Declined,
          respondedAt: now,
          declineReason: reason,
        },
      });
      await tx.dispatchOffer.updateMany({
        where: { serviceItemId: item.id, status: 'OFFERED' },
        data: { status: 'DECLINED', respondedAt: now, declineReason: reason },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'dispatch.decline',
          entityType: 'ServiceItem',
          entityId: item.id,
          metadata: { reason },
        },
      });
    });

    await this.scheduler.cancelTimeout(item.id);
    await this.flagReservation(item.reservationId, actor, reason);

    this.escalation.publish({
      type: 'dispatch.decline',
      alert: 'RED',
      reservationId: item.reservationId,
      serviceItemId: item.id,
      supplierId: item.supplierId,
      province: item.province,
      workerPhone: item.supplier?.primaryPhone ?? null,
      occurredAt: now.toISOString(),
    });

    return this.getView(item.reservationId);
  }

  /**
   * Invoked by the scheduler when a dispatch deadline elapses. No-ops if the
   * worker already responded.
   */
  async handleTimeout(serviceItemId: string): Promise<void> {
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
    });
    if (!item || item.status !== ServiceItemStatus.Offered) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceItem.update({
        where: { id: item.id },
        data: { status: ServiceItemStatus.Timeout },
      });
      await tx.dispatchOffer.updateMany({
        where: { serviceItemId: item.id, status: 'OFFERED' },
        data: { status: 'TIMEOUT' },
      });
      await tx.auditLog.create({
        data: {
          action: 'dispatch.timeout',
          entityType: 'ServiceItem',
          entityId: item.id,
        },
      });
    });

    await this.flagReservation(item.reservationId, null, 'dispatch timeout');

    this.escalation.publish({
      type: 'dispatch.timeout',
      alert: 'RED',
      reservationId: item.reservationId,
      serviceItemId: item.id,
      supplierId: item.supplierId,
      province: item.province,
      workerPhone: null,
      occurredAt: new Date().toISOString(),
    });
  }

  async reassign(
    serviceItemId: string,
    input: ReassignServiceItemRequest,
    actor: AuthUser,
  ): Promise<DispatchViewDto> {
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
    });
    if (!item) {
      throw new NotFoundException(`Service item ${serviceItemId} not found`);
    }

    await this.scheduler.cancelTimeout(item.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.dispatchOffer.updateMany({
        where: { serviceItemId: item.id, status: 'OFFERED' },
        data: { status: 'CANCELLED' },
      });
      await tx.serviceItem.update({
        where: { id: item.id },
        data: {
          status: ServiceItemStatus.Unassigned,
          supplierId: null,
          offeredAt: null,
          dispatchDeadline: null,
          respondedAt: null,
          declineReason: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'dispatch.reassign',
          entityType: 'ServiceItem',
          entityId: item.id,
          metadata: { preferredSupplierId: input.supplierId ?? null },
        },
      });
    });

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: item.reservationId },
    });
    if (reservation && reservation.status !== ReservationStatus.DispatchInProgress) {
      assertTransition(
        reservation.status as ReservationStatus,
        ReservationStatus.DispatchInProgress,
      );
      await this.prisma.reservation.update({
        where: { id: item.reservationId },
        data: { status: ReservationStatus.DispatchInProgress },
      });
    }

    await this.offerToNextCandidate(item, actor, input.supplierId);

    return this.getView(item.reservationId);
  }

  private async offerToNextCandidate(
    item: ServiceItem,
    actor: AuthUser | null,
    preferredSupplierId?: string,
  ): Promise<void> {
    const previousOffers = await this.prisma.dispatchOffer.findMany({
      where: { serviceItemId: item.id },
      select: { supplierId: true },
    });
    const excluded = new Set(previousOffers.map((offer) => offer.supplierId));
    const categories =
      SERVICE_TYPE_TO_SUPPLIER_CATEGORIES[item.serviceType as ServiceType];
    const now = new Date();

    const supplier = await this.pickSupplier(
      categories,
      excluded,
      now,
      item.province,
      preferredSupplierId,
    );

    if (!supplier) {
      await this.flagReservation(item.reservationId, actor, 'no eligible supplier');
      return;
    }

    const timeoutMs = resolveDispatchTimeoutMs({
      now,
      arrivalAt: item.serviceDateStart,
    });
    const deadline = new Date(now.getTime() + timeoutMs);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceItem.update({
        where: { id: item.id },
        data: {
          supplierId: supplier.id,
          status: ServiceItemStatus.Offered,
          offeredAt: now,
          dispatchDeadline: deadline,
          respondedAt: null,
          declineReason: null,
        },
      });
      await tx.dispatchOffer.create({
        data: {
          serviceItemId: item.id,
          supplierId: supplier.id,
          status: 'OFFERED',
          offeredAt: now,
          deadline,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor?.id ?? null,
          action: 'dispatch.offer',
          entityType: 'ServiceItem',
          entityId: item.id,
          metadata: { supplierId: supplier.id, deadline: deadline.toISOString() },
        },
      });
    });

    await this.scheduler.scheduleTimeout(item.id, timeoutMs);

    this.escalation.publish({
      type: 'dispatch.offer',
      alert: 'NONE',
      reservationId: item.reservationId,
      serviceItemId: item.id,
      supplierId: supplier.id,
      province: item.province,
      workerPhone: supplier.primaryPhone,
      occurredAt: now.toISOString(),
    });
  }

  private async pickSupplier(
    categories: readonly SupplierCategory[],
    excluded: Set<string>,
    now: Date,
    province: string | null,
    preferredSupplierId?: string,
  ): Promise<SupplierProfile | null> {
    if (preferredSupplierId && !excluded.has(preferredSupplierId)) {
      const preferred = await this.prisma.supplierProfile.findUnique({
        where: { id: preferredSupplierId },
      });
      if (preferred && this.isEligible(preferred, categories, now, province)) {
        return preferred;
      }
    }

    const candidates = await this.prisma.supplierProfile.findMany({
      where: {
        category: { in: [...categories] as PrismaSupplierCategory[] },
        isAvailable: true,
        verificationStatus: VERIFIED,
      },
      orderBy: { createdAt: 'asc' },
    });

    return (
      candidates.find(
        (candidate) =>
          !excluded.has(candidate.id) &&
          this.isEligible(candidate, categories, now, province),
      ) ?? null
    );
  }

  private isEligible(
    supplier: SupplierProfile,
    categories: readonly SupplierCategory[],
    now: Date,
    province: string | null,
  ): boolean {
    if (!categories.includes(supplier.category)) {
      return false;
    }
    if (!coversProvince(supplier.provincesActive, province)) {
      return false;
    }
    return canAutoDispatch(
      {
        verificationStatus: supplier.verificationStatus,
        isAvailable: supplier.isAvailable,
        credentialExpiresAt: supplier.credentialExpiresAt,
      },
      now,
    );
  }

  private async advanceIfFullyAccepted(
    reservationId: string,
    actor: AuthUser,
  ): Promise<void> {
    const reservation = await this.loadReservation(reservationId);
    if (
      reservation.status !== ReservationStatus.DispatchInProgress ||
      reservation.serviceItems.length === 0 ||
      !reservation.serviceItems.every(
        (item) => item.status === ServiceItemStatus.Accepted,
      )
    ) {
      return;
    }

    assertTransition(
      reservation.status as ReservationStatus,
      ReservationStatus.AssemblyAndEscalation,
    );
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.AssemblyAndEscalation },
    });
    await this.audit(actor, reservationId, 'reservation.fully_accepted');
  }

  private async flagReservation(
    reservationId: string,
    actor: AuthUser | null,
    reason: string,
  ): Promise<void> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) {
      return;
    }

    const from = reservation.status as ReservationStatus;
    if (from === ReservationStatus.ActionRequired) {
      return;
    }
    if (!canTransition(from, ReservationStatus.ActionRequired)) {
      return;
    }

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.ActionRequired },
    });
    await this.audit(actor, reservationId, 'reservation.action_required', {
      from,
      reason,
    });
  }

  private async loadReservation(reservationId: string): Promise<ReservationWithItems> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { serviceItems: { include: { supplier: true } } },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    return reservation;
  }

  private async loadItemForWorker(
    serviceItemId: string,
    actor: AuthUser,
  ): Promise<ServiceItem & { supplier: SupplierProfile | null }> {
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
      include: { supplier: true },
    });
    if (!item) {
      throw new NotFoundException(`Service item ${serviceItemId} not found`);
    }
    if (!item.supplier || item.supplier.userId !== actor.id) {
      throw new ForbiddenException('Service item is not assigned to this worker');
    }
    return item;
  }

  /**
   * Manual re-dispatch menu: eligible suppliers that have not already been
   * offered this item, restricted to those covering the item's province.
   */
  async getCandidates(serviceItemId: string): Promise<DispatchCandidateDto[]> {
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
    });
    if (!item) {
      throw new NotFoundException(`Service item ${serviceItemId} not found`);
    }

    const previousOffers = await this.prisma.dispatchOffer.findMany({
      where: { serviceItemId },
      select: { supplierId: true },
    });
    const excluded = new Set(previousOffers.map((offer) => offer.supplierId));
    const categories =
      SERVICE_TYPE_TO_SUPPLIER_CATEGORIES[item.serviceType as ServiceType];
    const now = new Date();

    const candidates = await this.prisma.supplierProfile.findMany({
      where: {
        category: { in: [...categories] as PrismaSupplierCategory[] },
        isAvailable: true,
        verificationStatus: VERIFIED,
      },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return candidates
      .filter(
        (candidate) =>
          !excluded.has(candidate.id) &&
          this.isEligible(candidate, categories, now, item.province),
      )
      .map((candidate) => ({
        supplierId: candidate.id,
        fullName: candidate.user.fullName,
        category: candidate.category,
        primaryPhone: candidate.primaryPhone,
        provincesActive: candidate.provincesActive,
        credentialExpiresAt: candidate.credentialExpiresAt
          ? candidate.credentialExpiresAt.toISOString()
          : null,
      }));
  }

  private assertOpenForResponse(item: ServiceItem): void {
    if (item.status !== ServiceItemStatus.Offered) {
      throw new ConflictException('Service item is not open for a response');
    }
  }

  private toItemDto(item: ServiceItemWithSupplier, now: Date): DispatchServiceItemDto {
    let escalation: DispatchServiceItemDto['escalation'] = 'NONE';
    if (
      item.status === ServiceItemStatus.Declined ||
      item.status === ServiceItemStatus.Timeout
    ) {
      escalation = 'RED';
    } else if (
      item.status === ServiceItemStatus.Offered &&
      item.offeredAt &&
      item.dispatchDeadline
    ) {
      escalation = escalationAlert({
        offeredAt: item.offeredAt,
        deadline: item.dispatchDeadline,
        now,
      });
    }

    return {
      id: item.id,
      serviceType: item.serviceType,
      status: item.status,
      supplierId: item.supplierId,
      province: item.province,
      offeredAt: item.offeredAt ? item.offeredAt.toISOString() : null,
      deadline: item.dispatchDeadline ? item.dispatchDeadline.toISOString() : null,
      escalation,
      workerPhone: item.supplier?.primaryPhone ?? null,
    };
  }

  private async audit(
    actor: AuthUser | null,
    reservationId: string,
    action: string,
    metadata?: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor?.id ?? null,
        action,
        entityType: 'Reservation',
        entityId: reservationId,
        metadata,
      },
    });
  }
}
