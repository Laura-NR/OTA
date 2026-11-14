import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ota/db';
import {
  DISRUPTION_SEVERITIES,
  OPS_LITE_OPEN_STATES,
  OPS_LITE_STATES,
  ReservationStatus,
  awaitsReply,
  compareInboxThreads,
  cubaProvinceName,
  isUrgentThread,
  onTheGround,
  pipelineClock,
  provinceToday,
  todaysMovements,
  type OpsLiteState,
  type PipelineClock,
} from '@ota/domain';
import type {
  OpsLiteClockDto,
  OpsLiteInboxDto,
  OpsLiteInboxThreadDto,
  OpsLitePipelineDto,
  OpsLitePipelineRowDto,
} from '@ota/schemas';

import { PrismaService } from '../prisma/prisma.service';

/** The bookings AL-Pipeline lists under each state; the count covers the rest. */
export const OPS_LITE_STATE_ROWS = 3;

/** How many bookings a state's rows are picked from, by its database order. */
const STATE_CANDIDATES = 50;

/** How many of the latest threads AL-Inbox lists beside the unread and urgent ones. */
export const OPS_LITE_INBOX_THREADS = 100;

const BOOKING_CONTEXT = {
  user: { select: { email: true, fullName: true, phone: true } },
  serviceItems: {
    select: {
      serviceType: true,
      status: true,
      province: true,
      serviceDateStart: true,
      serviceDateEnd: true,
      dispatchDeadline: true,
    },
  },
  instalments: {
    where: { status: 'DUE' },
    orderBy: { position: 'asc' },
    take: 1,
    select: { dueAt: true },
  },
} as const satisfies Prisma.ReservationInclude;

type BookingRow = Prisma.ReservationGetPayload<{ include: typeof BOOKING_CONTEXT }>;

/** Each state's database order, before the clock sorts the dispatch and payment states. */
const STATE_ORDER: Record<OpsLiteState, Prisma.ReservationOrderByWithRelationInput> = {
  ITINERARY_SUBMITTED: { createdAt: 'asc' },
  DISPATCH_IN_PROGRESS: { updatedAt: 'asc' },
  ASSEMBLY_AND_ESCALATION: { updatedAt: 'asc' },
  ACTION_REQUIRED: { updatedAt: 'asc' },
  SECURED_AND_INVOICED: { updatedAt: 'asc' },
  PENDING_PAYMENT: { updatedAt: 'asc' },
  CONFIRMED: { startDate: 'asc' },
  IN_PROGRESS: { startDate: 'asc' },
  COMPLETED: { endDate: 'desc' },
  CANCELLED: { updatedAt: 'desc' },
};

/** The states whose rows run against a clock: the soonest deadline leads. */
const BY_DEADLINE: readonly OpsLiteState[] = [
  ReservationStatus.DispatchInProgress,
  ReservationStatus.AssemblyAndEscalation,
  ReservationStatus.PendingPayment,
];

const ACCEPTED = ['ACCEPTED', 'FULFILLED'];

function offerDeadline(row: BookingRow): Date | null {
  const deadlines = row.serviceItems
    .filter((item) => item.status === 'OFFERED' && item.dispatchDeadline)
    .map((item) => item.dispatchDeadline!.getTime());
  return deadlines.length > 0 ? new Date(Math.min(...deadlines)) : null;
}

function clockOf(row: BookingRow, now: Date): PipelineClock {
  return pipelineClock(
    {
      status: row.status as ReservationStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      startDate: row.startDate,
      endDate: row.endDate,
      offerDeadline: offerDeadline(row),
      dueAt: row.instalments[0]?.dueAt ?? null,
    },
    now,
  );
}

function clockDto(clock: PipelineClock): OpsLiteClockDto {
  return clock.kind === 'date' ? { ...clock, date: clock.date.toISOString() } : clock;
}

/** The earliest deadline first, so the longest overdue leads; none last. */
function byDeadline(a: BookingRow, b: BookingRow): number {
  const rank = (row: BookingRow) =>
    (offerDeadline(row) ?? row.instalments[0]?.dueAt)?.getTime() ??
    Number.POSITIVE_INFINITY;
  return rank(a) - rank(b);
}

function context(row: BookingRow) {
  return {
    reservationId: row.id,
    bookingCode: row.bookingCode,
    status: row.status,
    travelerName: row.user.fullName,
    travelerEmail: row.user.email,
    travelerPhone: row.user.phone,
    partySize: Math.max(1, row.partySize),
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    provinces: [
      ...new Set(
        row.serviceItems
          .map((item) => item.province)
          .filter((province): province is string => province !== null),
      ),
    ],
  };
}

function pipelineRow(row: BookingRow, now: Date): OpsLitePipelineRowDto {
  return {
    ...context(row),
    serviceItemCount: row.serviceItems.length,
    serviceItemsAccepted: row.serviceItems.filter((item) =>
      ACCEPTED.includes(item.status),
    ).length,
    clock: clockDto(clockOf(row, now)),
  };
}

/**
 * Ops Lite's reads (AL-Pipeline, AL-Inbox): the desk's phone triage. The
 * rules are the domain's (`packages/domain/src/ops-lite`); this fetches the
 * rows. Nothing here writes.
 */
@Injectable()
export class OpsLiteService {
  constructor(private readonly prisma: PrismaService) {}

  async pipeline(now = new Date()): Promise<OpsLitePipelineDto> {
    const [counts, perState, running, openCases, dueOrStarting] = await Promise.all([
      this.prisma.reservation.groupBy({
        by: ['status'],
        where: { status: { not: ReservationStatus.Draft } },
        _count: { _all: true },
      }),
      Promise.all(
        OPS_LITE_STATES.map((status) =>
          this.prisma.reservation.findMany({
            where: { status },
            orderBy: STATE_ORDER[status],
            take: STATE_CANDIDATES,
            include: BOOKING_CONTEXT,
          }),
        ),
      ),
      this.prisma.reservation.findMany({
        where: { status: ReservationStatus.InProgress },
        select: {
          partySize: true,
          serviceItems: {
            select: {
              serviceType: true,
              province: true,
              serviceDateStart: true,
              serviceDateEnd: true,
            },
          },
        },
      }),
      this.prisma.disruptionCase.findMany({
        where: { status: 'OPEN' },
        orderBy: { openedAt: 'asc' },
        select: {
          id: true,
          reference: true,
          severity: true,
          title: true,
          province: true,
          scenario: true,
        },
      }),
      this.movementCandidates(now),
    ]);

    const countOf = (status: string) =>
      counts.find((entry) => entry.status === status)?._count._all ?? 0;
    const states = OPS_LITE_STATES.map((status, index) => {
      const rows = perState[index]!;
      const sorted = BY_DEADLINE.includes(status) ? [...rows].sort(byDeadline) : rows;
      return {
        status,
        count: countOf(status),
        rows: sorted.slice(0, OPS_LITE_STATE_ROWS).map((row) => pipelineRow(row, now)),
      };
    });

    const ground = onTheGround(
      running.map((booking) => ({
        partySize: booking.partySize,
        province: provinceToday(booking.serviceItems, now),
      })),
      openCases,
    );
    const severityRank = (severity: string) =>
      -DISRUPTION_SEVERITIES.indexOf(severity as (typeof DISRUPTION_SEVERITIES)[number]);

    const byId = new Map(dueOrStarting.map((row) => [row.id, row]));
    const movements = todaysMovements(
      dueOrStarting.map((row) => ({
        reservationId: row.id,
        status: row.status as ReservationStatus,
        startDate: row.startDate,
        endDate: row.endDate,
        dueAt: row.instalments[0]?.dueAt ?? null,
      })),
      now,
    ).map((movement) => {
      const row = byId.get(movement.reservationId)!;
      return {
        kind: movement.kind,
        at: movement.at ? movement.at.toISOString() : null,
        reservationId: row.id,
        bookingCode: row.bookingCode,
        travelerName: row.user.fullName,
        travelerEmail: row.user.email,
        partySize: Math.max(1, row.partySize),
      };
    });

    return {
      total: counts.reduce((sum, entry) => sum + entry._count._all, 0),
      inPipeline: OPS_LITE_OPEN_STATES.reduce((sum, status) => sum + countOf(status), 0),
      refreshedAt: now.toISOString(),
      states,
      ground: {
        bookings: ground.bookings,
        travelers: ground.travelers,
        provinces: ground.provinces.map((entry) => ({
          ...entry,
          province: cubaProvinceName(entry.province),
        })),
        cases: [...openCases]
          .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
          .map(({ id, reference, severity, title }) => ({
            id,
            reference,
            severity,
            title,
          })),
      },
      movements,
    };
  }

  /**
   * The bookings that may move today: payments falling due within a day
   * either side of now, and live trips starting or ending within a day (the
   * domain keeps those on Havana's today).
   */
  private movementCandidates(now: Date) {
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(now.getTime() - day);
    const to = new Date(now.getTime() + day);
    return this.prisma.reservation.findMany({
      where: {
        OR: [
          {
            status: ReservationStatus.PendingPayment,
            instalments: { some: { status: 'DUE', dueAt: { gte: from, lte: to } } },
          },
          {
            status: { in: [ReservationStatus.Confirmed, ReservationStatus.InProgress] },
            OR: [
              { startDate: { gte: from, lte: to } },
              { endDate: { gte: from, lte: to } },
            ],
          },
        ],
      },
      include: {
        user: { select: { email: true, fullName: true } },
        instalments: BOOKING_CONTEXT.instalments,
      },
    });
  }

  /**
   * AL-Inbox's threads: the bookings with the latest messages, plus every
   * booking with a message nobody opened or on an open case, so no urgent or
   * unread thread falls off the list.
   */
  async inbox(): Promise<OpsLiteInboxDto> {
    const [latest, pressing] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['reservationId'],
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
        take: OPS_LITE_INBOX_THREADS,
      }),
      this.prisma.reservation.findMany({
        where: {
          OR: [
            { messages: { some: { sender: 'TRAVELER', readAt: null } } },
            {
              messages: { some: {} },
              disruptions: { some: { case: { status: 'OPEN' } } },
            },
          ],
        },
        select: { id: true },
      }),
    ]);
    const ids = [
      ...new Set([
        ...latest.map((entry) => entry.reservationId),
        ...pressing.map((entry) => entry.id),
      ]),
    ];
    const rows = await this.prisma.reservation.findMany({
      where: { id: { in: ids } },
      include: {
        ...BOOKING_CONTEXT,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, sender: true, createdAt: true },
        },
        disruptions: {
          where: { case: { status: 'OPEN' } },
          take: 1,
          select: { case: { select: { id: true, reference: true } } },
        },
        _count: {
          select: { messages: { where: { sender: 'TRAVELER', readAt: null } } },
        },
      },
    });

    const threads: OpsLiteInboxThreadDto[] = rows
      .map((row) => {
        const last = row.messages[0]!;
        const input = {
          lastSender: last.sender,
          lastAt: last.createdAt,
          unread: row._count.messages,
          openDisruption: row.disruptions.length > 0,
        };
        return { row, input };
      })
      .sort((a, b) => compareInboxThreads(a.input, b.input))
      .map(({ row, input }) => ({
        ...context(row),
        lastMessage: {
          body: row.messages[0]!.body,
          sender: input.lastSender,
          createdAt: input.lastAt.toISOString(),
        },
        unread: input.unread,
        awaitingReply: awaitsReply(input),
        urgent: isUrgentThread(input),
        disruption: row.disruptions[0]?.case ?? null,
      }));

    return {
      threads,
      counts: {
        all: threads.length,
        urgent: threads.filter((thread) => thread.urgent).length,
        unread: threads.filter((thread) => thread.unread > 0).length,
      },
    };
  }
}
