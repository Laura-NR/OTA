import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import {
  canMoveEventRequest,
  derivedTrip,
  eventRequestAnswerOverdue,
  eventRequestIssues,
  festivalWindow,
  isLinkableBooking,
  isOpenEventRequest,
  isPriceLocked,
  ticketCharges,
  ticketCount,
  ticketInstalmentDueAt,
  travelerMayCancelEventRequest,
  type EventAccess,
  type EventRequestPath,
  type EventRequestStatus,
  type EventStatus,
  type ReservationStatus,
  type SeatCategoryKind,
} from '@ota/domain';
import { eventRequestEmail, type EventRequestEmailKind, type Mailer } from '@ota/email';
import type {
  ConfirmEventRequestRequest,
  CreateEventRequestRequest,
  CreateEventRequestResultDto,
  EventLinkTargetsDto,
  EventRequestDetailDto,
  EventRequestListItemDto,
  EventRequestListQuery,
  MyEventRequestDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { generateBookingCode } from '../common/booking-code';
import { storefrontPageUrl } from '../common/storefront-url';
import { DocumentsService } from '../documents/documents.service';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { customRequestPayload } from '../proposals/proposals.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

const INCLUDE = {
  event: {
    include: {
      nights: { orderBy: { position: 'asc' } },
      translations: { where: { published: true } },
    },
  },
  category: true,
  user: { select: { id: true, email: true, fullName: true } },
  reservation: { select: { id: true, bookingCode: true, status: true } },
  customRequest: { select: { id: true, reference: true } },
} satisfies Prisma.EventRequestInclude;

type RequestRow = Prisma.EventRequestGetPayload<{ include: typeof INCLUDE }>;

/** Bookings whose documents exist and are regenerated when seats join them. */
const DOCUMENTED_STATUSES: readonly string[] = ['CONFIRMED', 'IN_PROGRESS'];

/** Event price lines sit after the package's own, which repricing rewrites. */
const EVENT_LINE_POSITION = 1000;

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function decimal(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * M10 ticket concierge requests (`docs/schema-m10-events.md` D3–D7). A
 * traveler asks for seats behind sign-in; the trip they go on is a derived M5
 * custom request or one of their own bookings. The desk answers, confirms the
 * seats onto a booking at the price actually paid, or marks them unavailable.
 * Nothing is charged before confirmation; every step is audited and emailed.
 */
@Injectable()
export class EventRequestsService {
  private readonly logger = new Logger(EventRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    private readonly settings: OperatingSettingsService,
    private readonly documents: DocumentsService,
  ) {}

  async create(
    actor: AuthUser,
    input: CreateEventRequestRequest,
  ): Promise<CreateEventRequestResultDto> {
    const now = new Date();
    const event = await this.prisma.event.findFirst({
      where: { slug: input.eventSlug, status: 'PUBLISHED' },
      include: { nights: true, categories: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${input.eventSlug} not found`);
    }
    const choice = {
      categoryId: input.categoryId,
      nightIds: input.nightIds,
      seats: input.seats,
    };
    const issues = eventRequestIssues(
      {
        status: event.status as EventStatus,
        access: event.access as EventAccess,
        endsOn: event.endsOn,
        nights: event.nights,
        categories: event.categories.map((category) => ({
          id: category.id,
          kind: category.kind as SeatCategoryKind,
        })),
      },
      choice,
      this.tenant.concierge.maxSeats,
      now,
    );
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        message: 'The request cannot be taken',
        issues,
      });
    }
    const category = event.categories.find(
      (candidate) => candidate.id === input.categoryId,
    )!;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { nationality: true },
    });
    const nationality = input.nationality ?? user.nationality ?? undefined;

    let derived: ReturnType<typeof derivedTrip> | null = null;
    if (input.path === 'BUILD' || input.path === 'TICKETS_ONLY') {
      derived = derivedTrip({
        path: input.path,
        province: event.province,
        window: festivalWindow(event, category.kind as SeatCategoryKind, input.nightIds),
        seats: input.seats,
        arrival: input.arrival,
        totalNights: input.totalNights,
        afterProvince: input.afterProvince ?? null,
      });
      if ('issue' in derived) {
        throw new UnprocessableEntityException({
          message: 'The trip cannot be built from these dates',
          issues: [derived.issue],
        });
      }
    } else {
      await this.assertLinkTarget(actor.id, event, input);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = `VX-E-${generateBookingCode()}`;
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          if (input.phone || input.nationality) {
            await tx.user.update({
              where: { id: actor.id },
              data: {
                ...(input.phone ? { phone: input.phone } : {}),
                ...(input.nationality ? { nationality: input.nationality } : {}),
              },
            });
          }

          let customRequest: { id: string; reference: string } | null = null;
          let proposalId: string | null = null;
          if (derived && 'trip' in derived) {
            const trip = derived.trip;
            const requestReference = `VX-C-${generateBookingCode()}`;
            customRequest = await tx.customRequest.create({
              data: {
                userId: actor.id,
                reference: requestReference,
                locale: input.locale ?? null,
                payload: customRequestPayload(
                  {
                    startDate: trip.startDate,
                    endDate: trip.endDate,
                    adults: trip.adults,
                    children: 0,
                    inventoryItemIds: [],
                    nationality,
                    interests: [],
                    route: trip.route,
                  },
                  [],
                ),
                notes: `Event request ${reference} · ${event.name}${
                  input.path === 'TICKETS_ONLY' ? ' · tickets only' : ''
                }`,
              },
              select: { id: true, reference: true },
            });
            ({ id: proposalId } = await tx.proposal.create({
              data: { requestId: customRequest.id },
              select: { id: true },
            }));
            await tx.auditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'custom_request.created',
                entityType: 'CustomRequest',
                entityId: customRequest.id,
                metadata: {
                  reference: customRequest.reference,
                  adults: trip.adults,
                  children: 0,
                  stops: trip.route.length,
                  eventRequest: reference,
                },
              },
            });
          }

          const request = await tx.eventRequest.create({
            data: {
              reference,
              userId: actor.id,
              eventId: event.id,
              categoryId: category.id,
              nightIds: category.kind === 'PASS' ? [] : input.nightIds,
              seats: input.seats,
              path: input.path,
              customRequestId: customRequest?.id ?? input.customRequestId ?? null,
              reservationId: input.reservationId ?? null,
              locale: input.locale ?? null,
              notes: input.notes ?? null,
              currency: this.tenant.concierge.currency,
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'event_request.submitted',
              entityType: 'EventRequest',
              entityId: request.id,
              metadata: {
                reference,
                event: event.slug,
                seats: input.seats,
                nights: input.nightIds.length,
                path: input.path,
              },
            },
          });
          return {
            id: request.id,
            reference,
            customRequestReference: customRequest?.reference ?? null,
            proposalId,
          };
        });
        await this.notify(created.id, 'RECEIVED');
        return created;
      } catch (error) {
        if (isUniqueClash(error)) continue;
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique request reference');
  }

  async listMine(actor: AuthUser): Promise<MyEventRequestDto[]> {
    const rows = await this.prisma.eventRequest.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
    return rows.map((row) => this.toMine(row));
  }

  /** The traveler's bookings and open custom requests seats may go onto (D5). */
  async linkTargets(actor: AuthUser, eventSlug: string): Promise<EventLinkTargetsDto> {
    const event = await this.prisma.event.findFirst({
      where: { slug: eventSlug, status: 'PUBLISHED' },
      select: { startsOn: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventSlug} not found`);
    }
    const [bookings, requests] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { userId: actor.id },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          bookingCode: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      }),
      this.prisma.customRequest.findMany({
        where: { userId: actor.id, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, reference: true, createdAt: true },
      }),
    ]);
    return {
      bookings: bookings
        .filter((booking) => isLinkableBooking(booking, event))
        .map((booking) => ({
          id: booking.id,
          bookingCode: booking.bookingCode,
          startDate: day(booking.startDate),
          endDate: day(booking.endDate),
          status: booking.status,
        })),
      customRequests: requests.map((request) => ({
        id: request.id,
        reference: request.reference,
        createdAt: request.createdAt.toISOString(),
      })),
    };
  }

  async cancelMine(actor: AuthUser, id: string): Promise<MyEventRequestDto> {
    const row = await this.prisma.eventRequest.findFirst({
      where: { id, userId: actor.id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Event request ${id} not found`);
    }
    if (!travelerMayCancelEventRequest(row.status as EventRequestStatus)) {
      throw new ConflictException(`The request is ${row.status}`);
    }
    await this.close(actor, row, 'CANCELLED', 'Withdrawn by the traveler.');
    return this.toMine(await this.load(id));
  }

  async list(query: EventRequestListQuery): Promise<EventRequestListItemDto[]> {
    const [rows, answerHours] = await Promise.all([
      this.prisma.eventRequest.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...(query.eventId ? { eventId: query.eventId } : {}),
          ...(query.reservationId ? { reservationId: query.reservationId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        include: INCLUDE,
      }),
      this.answerHours(),
    ]);
    const now = new Date();
    return rows.map((row) => this.toListItem(row, now, answerHours));
  }

  async get(id: string): Promise<EventRequestDetailDto> {
    const [row, answerHours] = await Promise.all([this.load(id), this.answerHours()]);
    const bookings = row.reservationId
      ? []
      : await this.prisma.reservation.findMany({
          where: { userId: row.userId },
          orderBy: { startDate: 'asc' },
          select: {
            id: true,
            bookingCode: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        });
    const tickets = this.tickets(row);
    const total =
      row.pricePerSeat !== null && row.feePerSeat !== null
        ? ticketCharges(tickets, Number(row.pricePerSeat), Number(row.feePerSeat)).total
        : null;
    return {
      ...this.toListItem(row, new Date(), answerHours),
      travelerId: row.userId,
      nights: row.event.nights
        .filter((night) => row.nightIds.includes(night.id))
        .map((night) => ({
          date: day(night.date),
          label: night.label,
          venue: night.venue,
        })),
      notes: row.notes,
      locale: row.locale,
      indicativePricePerSeat: decimal(row.category.pricePerSeat),
      feePerSeatDefault: this.tenant.concierge.feePerSeat,
      pricePerSeat: decimal(row.pricePerSeat),
      feePerSeat: decimal(row.feePerSeat),
      total,
      currency: row.currency,
      closedReason: row.closedReason,
      answeredAt: iso(row.answeredAt),
      confirmedAt: iso(row.confirmedAt),
      closedAt: iso(row.closedAt),
      priceLocked: row.reservation
        ? isPriceLocked(row.reservation.status as ReservationStatus)
        : null,
      linkableBookings: bookings
        .filter((booking) => isLinkableBooking(booking, row.event))
        .map((booking) => ({
          id: booking.id,
          bookingCode: booking.bookingCode,
          startDate: day(booking.startDate),
          endDate: day(booking.endDate),
          status: booking.status,
        })),
    };
  }

  /** The desk can request these seats (the board's 48 h answer). */
  async markRequesting(actor: AuthUser, id: string): Promise<EventRequestDetailDto> {
    const row = await this.load(id);
    this.assertMove(row, 'REQUESTING');
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, row, { status: 'REQUESTING', answeredAt: new Date() });
      await this.audit(tx, actor, row, 'event_request.requesting', {});
    });
    await this.notify(id, 'REQUESTING');
    return this.get(id);
  }

  async markUnavailable(
    actor: AuthUser,
    id: string,
    reason: string,
  ): Promise<EventRequestDetailDto> {
    const row = await this.load(id);
    this.assertMove(row, 'UNAVAILABLE');
    await this.close(actor, row, 'UNAVAILABLE', reason);
    await this.notify(id, 'UNAVAILABLE');
    return this.get(id);
  }

  /** The desk withdraws an open request; a confirmed one ends only with its booking. */
  async cancel(
    actor: AuthUser,
    id: string,
    reason: string,
  ): Promise<EventRequestDetailDto> {
    const row = await this.load(id);
    if (!isOpenEventRequest(row.status as EventRequestStatus)) {
      throw new ConflictException(`The request is ${row.status}`);
    }
    await this.close(actor, row, 'CANCELLED', reason);
    return this.get(id);
  }

  /**
   * Confirm the seats onto a booking at the price actually paid (D6). The
   * tickets and the concierge fee become price lines and raise the total; once
   * the booking's price is locked, they are the one exception to the lock and
   * fall due as their own TICKETS instalment.
   */
  async confirm(
    actor: AuthUser,
    id: string,
    input: ConfirmEventRequestRequest,
  ): Promise<EventRequestDetailDto> {
    const row = await this.load(id);
    this.assertMove(row, 'CONFIRMED');
    const reservationId = row.reservationId ?? input.reservationId ?? null;
    if (!reservationId) {
      throw new ConflictException('Seats are confirmed onto a booking; link one first');
    }
    if (
      row.reservationId &&
      input.reservationId &&
      input.reservationId !== row.reservationId
    ) {
      throw new ConflictException('The request is already on another booking');
    }
    const booking = await this.prisma.reservation.findFirst({
      where: { id: reservationId, userId: row.userId },
      select: {
        id: true,
        bookingCode: true,
        status: true,
        endDate: true,
        totalAmount: true,
        totalCurrency: true,
      },
    });
    if (!booking || !isLinkableBooking(booking, row.event)) {
      throw new ConflictException("The booking is not one of the traveler's open trips");
    }

    const now = new Date();
    const tickets = this.tickets(row);
    const fee = this.tenant.concierge.feePerSeat;
    const charges = ticketCharges(tickets, input.pricePerSeat, fee);
    const locked = isPriceLocked(booking.status as ReservationStatus);
    const label = `${row.event.name} · ${row.category.name}`;
    let dueAt: Date | null = null;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reservationPriceLine.count({
        where: { reservationId, kind: { in: ['EVENT_TICKET', 'CONCIERGE_FEE'] } },
      });
      await tx.reservationPriceLine.createMany({
        data: [
          {
            reservationId,
            kind: 'EVENT_TICKET',
            label,
            quantity: tickets,
            unitAmount: input.pricePerSeat,
            amount: charges.ticketsAmount,
            currency: booking.totalCurrency,
            position: EVENT_LINE_POSITION + existing,
          },
          {
            reservationId,
            kind: 'CONCIERGE_FEE',
            label: `Concierge fee · ${row.event.name}`,
            quantity: tickets,
            unitAmount: fee,
            amount: charges.feeAmount,
            currency: booking.totalCurrency,
            position: EVENT_LINE_POSITION + existing + 1,
          },
        ],
      });
      await tx.reservation.update({
        where: { id: reservationId },
        data: { totalAmount: { increment: charges.total } },
      });

      if (locked) {
        const [last, balance] = await Promise.all([
          tx.paymentInstalment.findFirst({
            where: { reservationId },
            orderBy: { position: 'desc' },
            select: { position: true },
          }),
          tx.paymentInstalment.findFirst({
            where: { reservationId, kind: 'BALANCE', status: 'DUE' },
            select: { dueAt: true },
          }),
        ]);
        dueAt = ticketInstalmentDueAt(
          now,
          this.tenant.concierge.ticketPaymentDays,
          balance?.dueAt ?? null,
        );
        await tx.paymentInstalment.create({
          data: {
            reservationId,
            kind: 'TICKETS',
            position: (last?.position ?? -1) + 1,
            amount: charges.total,
            currency: booking.totalCurrency,
            dueAt,
          },
        });
      }

      await this.claim(tx, row, {
        status: 'CONFIRMED',
        reservationId,
        pricePerSeat: input.pricePerSeat,
        feePerSeat: fee,
        confirmedAt: now,
        answeredAt: row.answeredAt ?? now,
      });
      await this.audit(tx, actor, row, 'event_request.confirmed', {
        reservationId,
        bookingCode: booking.bookingCode,
        tickets,
        pricePerSeat: input.pricePerSeat.toFixed(2),
        feePerSeat: fee.toFixed(2),
        total: charges.total.toFixed(2),
        priceLocked: locked,
        instalmentDueAt: dueAt ? (dueAt as Date).toISOString() : null,
      });
    });

    if (DOCUMENTED_STATUSES.includes(booking.status)) {
      try {
        await this.documents.generate(reservationId, actor);
      } catch (error) {
        this.logger.error(
          `Document regeneration failed after event request ${row.reference}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    await this.notify(id, 'CONFIRMED', {
      tickets: charges.ticketsAmount,
      fee: charges.feeAmount,
      total: charges.total,
      currency: booking.totalCurrency,
      dueAt,
      bookingCode: booking.bookingCode,
    });
    return this.get(id);
  }

  private async assertLinkTarget(
    userId: string,
    event: { startsOn: Date },
    input: CreateEventRequestRequest,
  ): Promise<void> {
    if (input.reservationId) {
      const booking = await this.prisma.reservation.findFirst({
        where: { id: input.reservationId, userId },
        select: { status: true, endDate: true },
      });
      if (!booking || !isLinkableBooking(booking, event)) {
        throw new UnprocessableEntityException({
          message: 'That booking cannot take these seats',
          issues: ['BOOKING'],
        });
      }
    }
    if (input.customRequestId) {
      const request = await this.prisma.customRequest.findFirst({
        where: { id: input.customRequestId, userId, status: 'OPEN' },
        select: { id: true },
      });
      if (!request) {
        throw new UnprocessableEntityException({
          message: 'That custom request is not open',
          issues: ['CUSTOM_REQUEST'],
        });
      }
    }
  }

  private assertMove(row: RequestRow, to: EventRequestStatus): void {
    if (!canMoveEventRequest(row.status as EventRequestStatus, to)) {
      throw new ConflictException(`The request is ${row.status}`);
    }
  }

  /** Update only if nobody moved the request since it was read. */
  private async claim(
    tx: Prisma.TransactionClient,
    row: RequestRow,
    data: Prisma.EventRequestUncheckedUpdateManyInput,
  ): Promise<void> {
    const claimed = await tx.eventRequest.updateMany({
      where: { id: row.id, status: row.status },
      data,
    });
    if (claimed.count !== 1) {
      throw new ConflictException('The request changed meanwhile; reload it');
    }
  }

  private async close(
    actor: AuthUser,
    row: RequestRow,
    status: 'UNAVAILABLE' | 'CANCELLED',
    reason: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, row, {
        status,
        closedAt: now,
        closedReason: reason,
        ...(status === 'UNAVAILABLE' ? { answeredAt: row.answeredAt ?? now } : {}),
      });
      await this.audit(
        tx,
        actor,
        row,
        status === 'UNAVAILABLE'
          ? 'event_request.unavailable'
          : 'event_request.cancelled',
        { byTraveler: actor.id === row.userId },
      );
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    row: RequestRow,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action,
        entityType: 'EventRequest',
        entityId: row.id,
        metadata: { reference: row.reference, ...metadata } as Prisma.InputJsonValue,
      },
    });
  }

  /** Best-effort: a failed email never undoes a stored step. */
  private async notify(
    id: string,
    kind: EventRequestEmailKind,
    amounts: Parameters<typeof eventRequestEmail>[0]['amounts'] = null,
  ): Promise<void> {
    try {
      const row = await this.load(id);
      const answerHours = await this.answerHours();
      const text = this.localized(row);
      const seatsLine = `${row.seats} × ${text.categoryName}${
        text.nights.length > 0
          ? ` · ${text.nights.map((night) => night.label).join(', ')}`
          : ''
      }`;
      await this.mailer.send(
        eventRequestEmail({
          kind,
          to: row.user.email,
          name: row.user.fullName ?? row.user.email,
          reference: row.reference,
          eventName: text.eventName,
          seatsLine,
          answerHours,
          confirmBy: row.event.confirmBy,
          amounts,
          reason: kind === 'UNAVAILABLE' ? row.closedReason : null,
          portalUrl: storefrontPageUrl(this.tenant, row.locale, '/account'),
          locale: row.locale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Event request email (${kind}) failed for ${id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async answerHours(): Promise<number> {
    return (await this.settings.thresholds()).conciergeAnswerHours;
  }

  private tickets(row: RequestRow): number {
    return ticketCount(
      row.category.kind as SeatCategoryKind,
      row.seats,
      row.nightIds.length,
    );
  }

  /** The request's text in its language, from a published overlay where one exists. */
  private localized(row: RequestRow) {
    const overlay = row.event.translations.find(
      (translation) => translation.locale === row.locale,
    );
    const field = <T>(
      value: Prisma.JsonValue | undefined,
      key: string,
    ): T | undefined => {
      const map =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return map[key] as T | undefined;
    };
    const category = field<{ name?: string | null }>(overlay?.categories, row.categoryId);
    return {
      eventName: overlay?.name ?? row.event.name,
      categoryName: category?.name ?? row.category.name,
      nights: row.event.nights
        .filter((night) => row.nightIds.includes(night.id))
        .map((night) => ({
          date: day(night.date),
          label:
            field<{ label?: string | null }>(overlay?.nights, night.id)?.label ??
            night.label,
          venue: night.venue,
        })),
    };
  }

  private eventName(row: RequestRow): string {
    return this.localized(row).eventName;
  }

  private eventSummary(row: RequestRow) {
    return {
      id: row.event.id,
      slug: row.event.slug,
      name: this.eventName(row),
      startsOn: day(row.event.startsOn),
      endsOn: day(row.event.endsOn),
      datesConfirmed: row.event.datesConfirmed,
      confirmBy: row.event.confirmBy ? day(row.event.confirmBy) : null,
    };
  }

  private toListItem(
    row: RequestRow,
    now: Date,
    answerHours: number,
  ): EventRequestListItemDto {
    return {
      id: row.id,
      reference: row.reference,
      status: row.status as EventRequestStatus,
      overdue: eventRequestAnswerOverdue(
        { status: row.status as EventRequestStatus, createdAt: row.createdAt },
        now,
        answerHours,
      ),
      path: row.path as EventRequestPath,
      event: { ...this.eventSummary(row), name: row.event.name },
      travelerName: row.user.fullName,
      travelerEmail: row.user.email,
      categoryName: row.category.name,
      categoryKind: row.category.kind as SeatCategoryKind,
      seats: row.seats,
      tickets: this.tickets(row),
      reservationId: row.reservation?.id ?? null,
      bookingCode: row.reservation?.bookingCode ?? null,
      customRequestId: row.customRequest?.id ?? null,
      customRequestReference: row.customRequest?.reference ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toMine(row: RequestRow): MyEventRequestDto {
    const tickets = this.tickets(row);
    const total =
      row.pricePerSeat !== null && row.feePerSeat !== null
        ? ticketCharges(tickets, Number(row.pricePerSeat), Number(row.feePerSeat)).total
        : null;
    return {
      id: row.id,
      reference: row.reference,
      status: row.status as EventRequestStatus,
      path: row.path as EventRequestPath,
      event: this.eventSummary(row),
      categoryName: this.localized(row).categoryName,
      categoryKind: row.category.kind as SeatCategoryKind,
      nights: this.localized(row).nights.map(({ date, label }) => ({ date, label })),
      seats: row.seats,
      tickets,
      bookingCode: row.reservation?.bookingCode ?? null,
      reservationId: row.reservation?.id ?? null,
      customRequestReference: row.customRequest?.reference ?? null,
      pricePerSeat: decimal(row.pricePerSeat),
      feePerSeat: decimal(row.feePerSeat),
      total,
      currency: row.currency,
      closedReason: row.closedReason,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: iso(row.confirmedAt),
    };
  }

  private async load(id: string): Promise<RequestRow> {
    const row = await this.prisma.eventRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Event request ${id} not found`);
    }
    return row;
  }
}
