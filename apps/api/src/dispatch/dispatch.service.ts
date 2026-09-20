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
  escalationAlert,
  resolveDispatchTimeoutMs,
  type ServiceType,
  type SupplierCategory,
} from '@ota/domain';
import type {
  DispatchServiceItemDto,
  DispatchViewDto,
  ReassignServiceItemRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { DISPATCH_SCHEDULER, type DispatchScheduler } from './dispatch.scheduler';

const VERIFIED = 'VERIFIED';

type ReservationWithItems = Reservation & { serviceItems: ServiceItem[] };

@Injectable()
export class DispatchService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DISPATCH_SCHEDULER) private readonly scheduler: DispatchScheduler,
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
      status: reservation.status as ReservationStatus,
      serviceItems: reservation.serviceItems.map((item) => this.toItemDto(item, now)),
    };
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
  }

  private async pickSupplier(
    categories: readonly SupplierCategory[],
    excluded: Set<string>,
    now: Date,
    preferredSupplierId?: string,
  ): Promise<SupplierProfile | null> {
    if (preferredSupplierId && !excluded.has(preferredSupplierId)) {
      const preferred = await this.prisma.supplierProfile.findUnique({
        where: { id: preferredSupplierId },
      });
      if (preferred && this.isEligible(preferred, categories, now)) {
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
          !excluded.has(candidate.id) && this.isEligible(candidate, categories, now),
      ) ?? null
    );
  }

  private isEligible(
    supplier: SupplierProfile,
    categories: readonly SupplierCategory[],
    now: Date,
  ): boolean {
    if (!categories.includes(supplier.category)) {
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
      include: { serviceItems: true },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    return reservation;
  }

  private async loadItemForWorker(
    serviceItemId: string,
    actor: AuthUser,
  ): Promise<ServiceItem> {
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

  private assertOpenForResponse(item: ServiceItem): void {
    if (item.status !== ServiceItemStatus.Offered) {
      throw new ConflictException('Service item is not open for a response');
    }
  }

  private toItemDto(item: ServiceItem, now: Date): DispatchServiceItemDto {
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
      offeredAt: item.offeredAt ? item.offeredAt.toISOString() : null,
      deadline: item.dispatchDeadline ? item.dispatchDeadline.toISOString() : null,
      escalation,
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
