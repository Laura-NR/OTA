import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import {
  JOB_STATUSES,
  WORKER_HOME_MESSAGES,
  awaitsReply,
  compareInboxThreads,
  isUrgentThread,
  jobRunsToday,
  workerMessageRefusal,
  type InboxThreadInput,
  type SupplierCategory,
  type WorkerMessageRefusal,
} from '@ota/domain';
import { workerMessageEmail, type Mailer } from '@ota/email';
import type {
  BookingWorkerThreadDto,
  DeskWorkerMessageRequest,
  DeskWorkerThreadDto,
  OpsLiteWorkerThreadDto,
  SendWorkerMessageRequest,
  WorkerMessageDto,
  WorkerMessagesReadDto,
  WorkerThreadDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { backofficeBaseUrl } from '../common/backoffice-url';
import { MAILER } from '../email/email.module';
import {
  ESCALATION_PUBLISHER,
  type EscalationPublisher,
} from '../escalation/escalation.publisher';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

/** The most of a thread the desk opens at once: the latest. */
const DESK_THREAD_SHOWN = 200;

/** AL-Inbox's worker threads: the latest, plus every one with an unread message. */
const INBOX_LATEST = 100;

const MESSAGE_SELECT = {
  id: true,
  supplierId: true,
  sender: true,
  body: true,
  serviceItemId: true,
  writtenAt: true,
  clientRef: true,
  readAt: true,
  createdAt: true,
  author: { select: { fullName: true } },
  serviceItem: { select: { reservation: { select: { bookingCode: true } } } },
} satisfies Prisma.WorkerMessageSelect;

type MessageRow = Prisma.WorkerMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

const SUPPLIER_SELECT = {
  id: true,
  category: true,
  primaryPhone: true,
  user: { select: { fullName: true, email: true } },
} satisfies Prisma.SupplierProfileSelect;

type SupplierRow = Prisma.SupplierProfileGetPayload<{ select: typeof SUPPLIER_SELECT }>;

const REFUSAL_MESSAGE: Record<WorkerMessageRefusal, string> = {
  in_future: 'The message is timed after now',
  not_your_job: 'That job is not yours',
};

function firstName(fullName: string | null | undefined): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}

function workerName(supplier: SupplierRow): string {
  return supplier.user.fullName?.trim() || supplier.user.email;
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toDto(row: MessageRow): WorkerMessageDto {
  return {
    id: row.id,
    sender: row.sender,
    body: row.body,
    authorName: row.sender === 'OPERATIONS' ? firstName(row.author?.fullName) : null,
    serviceItemId: row.serviceItemId,
    bookingCode: row.serviceItem?.reservation.bookingCode ?? null,
    writtenAt: row.writtenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    clientRef: row.clientRef,
  };
}

/**
 * Worker ↔ desk messages (`docs/schema-w-messages.md`, approved M1–M8): each
 * worker's one thread with the desk, apart from every traveler's. A worker's
 * message is kept once however often the phone resends it; each message goes
 * out on `/ops`, and a worker's is copied to the desk's inbox by email.
 */
@Injectable()
export class WorkerMessagesService {
  private readonly logger = new Logger(WorkerMessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ESCALATION_PUBLISHER) private readonly escalation: EscalationPublisher,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  /** The worker's thread: its latest messages and the desk's unread ones (M5). */
  async workerThread(actor: AuthUser): Promise<WorkerThreadDto> {
    const supplier = await this.ownProfile(actor);
    return this.threadOf(supplier.id);
  }

  /** The same, for a supplier already known (W-Home). */
  async threadOf(supplierId: string): Promise<WorkerThreadDto> {
    const [latest, unread] = await Promise.all([
      this.prisma.workerMessage.findMany({
        where: { supplierId },
        orderBy: { createdAt: 'desc' },
        take: WORKER_HOME_MESSAGES,
        select: MESSAGE_SELECT,
      }),
      this.prisma.workerMessage.count({
        where: { supplierId, sender: 'OPERATIONS', readAt: null },
      }),
    ]);
    return { messages: latest.reverse().map(toDto), unread };
  }

  /**
   * A message the worker wrote, sent from the phone's queue (M4). A resend
   * (the same `clientRef`) returns the first; one naming a job must name one
   * of theirs, offered or taken.
   */
  async workerSend(
    actor: AuthUser,
    input: SendWorkerMessageRequest,
    now: Date = new Date(),
  ): Promise<WorkerMessageDto> {
    const supplier = await this.ownProfile(actor);
    const known = await this.knownMessage(input.clientRef, supplier.id);
    if (known) return known;

    const writtenAt = new Date(input.writtenAt);
    await this.assertMayName(supplier.id, input.serviceItemId ?? null, writtenAt, now);

    let row: MessageRow;
    try {
      row = await this.prisma.workerMessage.create({
        data: {
          supplierId: supplier.id,
          sender: 'WORKER',
          body: input.body,
          serviceItemId: input.serviceItemId ?? null,
          writtenAt,
          clientRef: input.clientRef,
        },
        select: MESSAGE_SELECT,
      });
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
      const raced = await this.knownMessage(input.clientRef, supplier.id);
      if (raced) return raced;
      throw error;
    }

    this.announce(row);
    await this.copyToDesk(supplier, row);
    return toDto(row);
  }

  /** The worker opened the thread: the desk's messages are read (M3). */
  async workerMarkRead(
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<WorkerMessagesReadDto> {
    const supplier = await this.ownProfile(actor);
    const { count } = await this.prisma.workerMessage.updateMany({
      where: { supplierId: supplier.id, sender: 'OPERATIONS', readAt: null },
      data: { readAt: now },
    });
    return { read: count };
  }

  /** A worker's thread as the desk opens it (M6). */
  async deskThread(supplierId: string): Promise<DeskWorkerThreadDto> {
    const supplier = await this.supplier(supplierId);
    const latest = await this.prisma.workerMessage.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      take: DESK_THREAD_SHOWN,
      select: MESSAGE_SELECT,
    });
    return {
      supplierId,
      workerName: workerName(supplier),
      category: supplier.category as SupplierCategory,
      phone: supplier.primaryPhone,
      messages: latest.reverse().map(toDto),
    };
  }

  /**
   * A message from the desk to a worker. From a booking it names that
   * booking's service, which must be the worker's, offered or taken.
   */
  async deskSend(
    actor: AuthUser,
    supplierId: string,
    input: DeskWorkerMessageRequest,
    now: Date = new Date(),
  ): Promise<WorkerMessageDto> {
    await this.supplier(supplierId);
    await this.assertMayName(supplierId, input.serviceItemId ?? null, null, now);
    const row = await this.prisma.workerMessage.create({
      data: {
        supplierId,
        sender: 'OPERATIONS',
        body: input.body,
        authorId: actor.id,
        serviceItemId: input.serviceItemId ?? null,
      },
      select: MESSAGE_SELECT,
    });
    this.announce(row);
    return toDto(row);
  }

  /** The desk opened a worker's thread: the worker's messages are read (M3). */
  async deskMarkRead(
    supplierId: string,
    now: Date = new Date(),
  ): Promise<WorkerMessagesReadDto> {
    await this.supplier(supplierId);
    const { count } = await this.prisma.workerMessage.updateMany({
      where: { supplierId, sender: 'WORKER', readAt: null },
      data: { readAt: now },
    });
    return { read: count };
  }

  /**
   * A-Booking's "Worker threads": each worker holding one of the booking's
   * services, with their latest message about it.
   */
  async bookingThreads(reservationId: string): Promise<BookingWorkerThreadDto[]> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        serviceItems: {
          where: { supplierId: { not: null } },
          orderBy: { serviceDateStart: 'asc' },
          select: { id: true, supplierId: true, supplier: { select: SUPPLIER_SELECT } },
        },
      },
    });
    if (!reservation)
      throw new NotFoundException(`Reservation ${reservationId} not found`);

    const bySupplier = new Map<string, { supplier: SupplierRow; itemIds: string[] }>();
    for (const item of reservation.serviceItems) {
      if (!item.supplierId || !item.supplier) continue;
      const entry = bySupplier.get(item.supplierId) ?? {
        supplier: item.supplier,
        itemIds: [],
      };
      entry.itemIds.push(item.id);
      bySupplier.set(item.supplierId, entry);
    }
    const itemIds = [...bySupplier.values()].flatMap((entry) => entry.itemIds);
    if (itemIds.length === 0) return [];

    const [latest, unread] = await Promise.all([
      this.prisma.workerMessage.findMany({
        where: { serviceItemId: { in: itemIds } },
        orderBy: { createdAt: 'desc' },
        distinct: ['supplierId'],
        select: { supplierId: true, body: true, sender: true, createdAt: true },
      }),
      this.prisma.workerMessage.groupBy({
        by: ['supplierId'],
        where: { serviceItemId: { in: itemIds }, sender: 'WORKER', readAt: null },
        _count: { _all: true },
      }),
    ]);

    return [...bySupplier.entries()].map(([supplierId, { supplier, itemIds: ids }]) => {
      const last = latest.find((row) => row.supplierId === supplierId);
      return {
        supplierId,
        workerName: workerName(supplier),
        category: supplier.category as SupplierCategory,
        phone: supplier.primaryPhone,
        serviceItemIds: ids,
        lastMessage: last
          ? {
              body: last.body,
              sender: last.sender,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        unread: unread.find((row) => row.supplierId === supplierId)?._count._all ?? 0,
      };
    });
  }

  /**
   * AL-Inbox's worker threads (M6): the latest threads plus every one with an
   * unread message, urgent first, each with the worker's current or next job.
   */
  async inboxThreads(now: Date = new Date()): Promise<OpsLiteWorkerThreadDto[]> {
    const [recent, unreadCounts] = await Promise.all([
      this.prisma.workerMessage.findMany({
        orderBy: { createdAt: 'desc' },
        distinct: ['supplierId'],
        take: INBOX_LATEST,
        select: { supplierId: true },
      }),
      this.prisma.workerMessage.groupBy({
        by: ['supplierId'],
        where: { sender: 'WORKER', readAt: null },
        _count: { _all: true },
      }),
    ]);
    const supplierIds = [
      ...new Set([
        ...recent.map((row) => row.supplierId),
        ...unreadCounts.map((row) => row.supplierId),
      ]),
    ];
    if (supplierIds.length === 0) return [];

    const [lasts, suppliers, jobs] = await Promise.all([
      this.prisma.workerMessage.findMany({
        where: { supplierId: { in: supplierIds } },
        orderBy: { createdAt: 'desc' },
        distinct: ['supplierId'],
        select: {
          supplierId: true,
          body: true,
          sender: true,
          createdAt: true,
          serviceItem: { select: { serviceDateStart: true, serviceDateEnd: true } },
        },
      }),
      this.prisma.supplierProfile.findMany({
        where: { id: { in: supplierIds } },
        select: SUPPLIER_SELECT,
      }),
      this.prisma.serviceItem.findMany({
        where: {
          supplierId: { in: supplierIds },
          status: { in: [...JOB_STATUSES] },
          serviceDateEnd: { gte: startOfDay(now) },
        },
        orderBy: { serviceDateStart: 'asc' },
        select: {
          id: true,
          supplierId: true,
          reservationId: true,
          serviceType: true,
          province: true,
          serviceDateStart: true,
          serviceDateEnd: true,
          reservation: { select: { bookingCode: true } },
        },
      }),
    ]);

    const threads = supplierIds.flatMap((supplierId) => {
      const last = lasts.find((row) => row.supplierId === supplierId);
      const supplier = suppliers.find((row) => row.id === supplierId);
      if (!last || !supplier) return [];
      const job = jobs.find((row) => row.supplierId === supplierId) ?? null;
      const unread =
        unreadCounts.find((row) => row.supplierId === supplierId)?._count._all ?? 0;
      const input: InboxThreadInput = {
        kind: 'worker',
        lastSender: last.sender,
        lastAt: last.createdAt,
        unread,
        openDisruption: false,
        jobToday: last.serviceItem
          ? jobRunsToday(
              {
                startsAt: last.serviceItem.serviceDateStart,
                endsAt: last.serviceItem.serviceDateEnd,
              },
              now,
            )
          : false,
      };
      const dto: OpsLiteWorkerThreadDto = {
        supplierId,
        workerName: workerName(supplier),
        category: supplier.category as SupplierCategory,
        phone: supplier.primaryPhone,
        job: job
          ? {
              serviceItemId: job.id,
              reservationId: job.reservationId,
              bookingCode: job.reservation.bookingCode,
              serviceType: job.serviceType,
              province: job.province,
              startsAt: job.serviceDateStart.toISOString(),
              endsAt: job.serviceDateEnd.toISOString(),
            }
          : null,
        lastMessage: {
          body: last.body,
          sender: last.sender,
          createdAt: last.createdAt.toISOString(),
        },
        unread,
        awaitingReply: awaitsReply(input),
        urgent: isUrgentThread(input),
        jobToday: input.jobToday,
      };
      return [{ input, dto }];
    });
    return threads
      .sort((a, b) => compareInboxThreads(a.input, b.input))
      .map((thread) => thread.dto);
  }

  private async ownProfile(actor: AuthUser): Promise<SupplierRow> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: SUPPLIER_SELECT,
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }
    return profile;
  }

  private async supplier(supplierId: string): Promise<SupplierRow> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id: supplierId },
      select: SUPPLIER_SELECT,
    });
    if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);
    return supplier;
  }

  /** M2, M4: the job a message names is the worker's, and its time is not ahead of now. */
  private async assertMayName(
    supplierId: string,
    serviceItemId: string | null,
    writtenAt: Date | null,
    now: Date,
  ): Promise<void> {
    const item = serviceItemId
      ? await this.prisma.serviceItem.findUnique({
          where: { id: serviceItemId },
          select: {
            supplierId: true,
            dispatchOffers: { select: { supplierId: true } },
          },
        })
      : undefined;
    const refusal = workerMessageRefusal({
      supplierId,
      writtenAt,
      now,
      job:
        item === undefined
          ? undefined
          : item && {
              supplierId: item.supplierId,
              offeredSupplierIds: item.dispatchOffers.map((offer) => offer.supplierId),
            },
    });
    if (refusal) throw new UnprocessableEntityException(REFUSAL_MESSAGE[refusal]);
  }

  private async knownMessage(
    clientRef: string,
    supplierId: string,
  ): Promise<WorkerMessageDto | null> {
    const known = await this.prisma.workerMessage.findUnique({
      where: { clientRef },
      select: MESSAGE_SELECT,
    });
    if (!known) return null;
    if (known.supplierId !== supplierId) {
      throw new ConflictException('That message id is taken');
    }
    return toDto(known);
  }

  private announce(row: MessageRow): void {
    this.escalation.publish({
      type: 'worker.message',
      supplierId: row.supplierId,
      messageId: row.id,
      sender: row.sender,
      serviceItemId: row.serviceItemId,
      occurredAt: row.createdAt.toISOString(),
    });
  }

  /** M5: the desk's email copy, best effort, as for a traveler's message. */
  private async copyToDesk(supplier: SupplierRow, row: MessageRow): Promise<void> {
    const to = process.env.OPS_NOTIFY_EMAIL;
    if (!to) return;
    try {
      await this.mailer.send(
        workerMessageEmail({
          to,
          workerName: workerName(supplier),
          bookingCode: row.serviceItem?.reservation.bookingCode ?? null,
          body: row.body,
          threadUrl: `${backofficeBaseUrl()}/suppliers/${supplier.id}#worker-thread`,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Worker message copy failed for supplier ${supplier.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
