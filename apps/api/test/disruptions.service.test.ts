import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AdvisoriesService } from '../src/advisories/advisories.service';
import type { AuthUser } from '../src/common/auth/auth-user';
import { DisruptionsService } from '../src/disruptions/disruptions.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const ANA: AuthUser = {
  id: 'u-ana',
  email: 'ana@example.test',
  role: 'OPERATIONS_ADMIN',
};
const HOLM: AuthUser = { id: 'u-holm', email: 'holm@example.test', role: 'TRAVELER' };
const OTHER: AuthUser = { id: 'u-other', email: 'other@example.test', role: 'TRAVELER' };

const RES_HOLM = '00000000-0000-4000-8000-000000000001';
const RES_OTHER = '00000000-0000-4000-8000-000000000002';

const tenant = parseTenantConfig({
  tenantId: 'vereda',
  branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
  disruptions: {
    scenarios: [
      {
        key: 'outage',
        label: 'Power outage > 12 h',
        trigger: 'Outage > 6 h at a traveler accommodation',
        steps: [
          { text: 'Confirm safety', owner: 'Reservations', due: 'within 30 min' },
          { text: 'Confirm generator', owner: 'Local coordinator', due: 'within 2 h' },
        ],
        options: [
          { key: 'A', title: 'Stay at the casa', detail: 'No change to price' },
          { key: 'B', title: 'Move tonight', detail: 'Same price' },
        ],
        policy: 'Meal vouchers for outages over 12 h.',
      },
    ],
  },
});

const DAY = 86_400_000;

type Row = Record<string, unknown> & { id: string };

let sequence = 0;
const uuid = () => `00000000-0000-4000-9000-${String((sequence += 1)).padStart(12, '0')}`;

/** Just enough Prisma for the case workflow, in memory. */
function fakePrisma(now: Date) {
  const users: Row[] = [
    { id: ANA.id, email: ANA.email, fullName: 'Ana R.', role: 'OPERATIONS_ADMIN' },
    {
      id: HOLM.id,
      email: HOLM.email,
      fullName: 'Anders Holm',
      phone: '+45 0000',
      nationality: 'DK',
      locale: 'en',
      anonymizedAt: null,
      role: 'TRAVELER',
    },
    {
      id: OTHER.id,
      email: OTHER.email,
      fullName: 'Other',
      phone: null,
      nationality: null,
      locale: 'es',
      anonymizedAt: null,
      role: 'TRAVELER',
    },
  ];
  const reservations: Row[] = [
    {
      id: RES_HOLM,
      bookingCode: 'VX6RQ4JD',
      status: 'IN_PROGRESS',
      userId: HOLM.id,
      partySize: 2,
      startDate: new Date(now.getTime() - 2 * DAY),
      endDate: new Date(now.getTime() + 4 * DAY),
    },
    {
      id: RES_OTHER,
      bookingCode: 'VX8TL2VN',
      status: 'CONFIRMED',
      userId: OTHER.id,
      partySize: 2,
      startDate: new Date(now.getTime() + 2 * DAY),
      endDate: new Date(now.getTime() + 9 * DAY),
    },
  ];
  const cases: Row[] = [];
  const steps: Row[] = [];
  const options: Row[] = [];
  const bookings: Row[] = [];
  const audits: Row[] = [];
  const user = (id: unknown) => users.find((item) => item.id === id) ?? null;

  const bookingView = (row: Row) => {
    const reservation = reservations.find((item) => item.id === row.reservationId)!;
    return {
      ...row,
      reservation: {
        ...reservation,
        user: user(reservation.userId),
        travelers: [],
      },
      confirmedBy: user(row.safetyConfirmedBy),
      chosenBy: user(row.chosenById),
    };
  };
  const caseView = (row: Row) => ({
    ...row,
    owner: user(row.ownerId),
    steps: steps
      .filter((item) => item.caseId === row.id)
      .map((item) => ({ ...item, doneBy: user(item.doneById) })),
    options: options
      .filter((item) => item.caseId === row.id)
      .sort((a, b) => Number(a.position) - Number(b.position)),
    bookings: bookings.filter((item) => item.caseId === row.id).map(bookingView),
    advisories: [],
  });
  const matchesBooking = (row: Row, where: Record<string, unknown>) => {
    if (where.id) {
      const id = where.id as string | { in: string[] };
      if (typeof id === 'string' ? row.id !== id : !id.in.includes(row.id)) return false;
    }
    if ('chosenOptionKey' in where && row.chosenOptionKey !== where.chosenOptionKey) {
      return false;
    }
    const deadline = where.offerDeadline as { gt: Date } | undefined;
    if (
      deadline &&
      !(row.offerDeadline instanceof Date && row.offerDeadline > deadline.gt)
    ) {
      return false;
    }
    const kase = where.case as { status: string } | undefined;
    if (kase && cases.find((item) => item.id === row.caseId)?.status !== kase.status) {
      return false;
    }
    return true;
  };

  const prisma = {
    audits,
    bookings,
    disruptionCase: {
      count: async () => cases.length,
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = cases.find((item) => item.id === where.id);
        return row ? caseView(row) : null;
      },
      findMany: async ({ where }: { where?: { status?: string } }) =>
        cases
          .filter((row) => !where?.status || row.status === where.status)
          .map(caseView),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = uuid();
        const nested = data as {
          steps: { create: Row[] };
          options: { create: Row[] };
          bookings: { create: Row[] };
        };
        const row: Row = {
          id,
          reference: data.reference,
          scenario: data.scenario,
          severity: data.severity,
          status: 'OPEN',
          province: data.province,
          title: data.title,
          summary: data.summary,
          policy: data.policy,
          ownerId: data.ownerId,
          openedAt: now,
          closedAt: null,
        };
        cases.push(row);
        nested.steps.create.forEach((step) =>
          steps.push({ ...step, id: uuid(), caseId: id, doneAt: null, doneById: null }),
        );
        nested.options.create.forEach((option) =>
          options.push({ ...option, id: uuid(), caseId: id }),
        );
        nested.bookings.create.forEach((booking) =>
          prisma.disruptionCaseBooking.createMany({
            data: [{ caseId: id, reservationId: booking.reservationId }],
          }),
        );
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = cases.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    disruptionStep: {
      update: async ({ where, data }: { where: { id: string }; data: Row }) =>
        Object.assign(
          steps.find((item) => item.id === where.id)!,
          data,
        ),
    },
    disruptionOption: {
      deleteMany: async ({ where }: { where: { caseId: string } }) => {
        for (let i = options.length - 1; i >= 0; i -= 1) {
          if (options[i]!.caseId === where.caseId) options.splice(i, 1);
        }
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        data.forEach((option) => options.push({ ...option, id: uuid() }));
        return { count: data.length };
      },
    },
    disruptionCaseBooking: {
      createMany: async ({
        data,
      }: {
        data: { caseId: string; reservationId: string }[];
      }) => {
        for (const item of data) {
          bookings.push({
            id: uuid(),
            ...item,
            safety: 'UNKNOWN',
            lastContactAt: null,
            safetyNote: null,
            safetyConfirmedBy: null,
            offerSentAt: null,
            offerDeadline: null,
            defaultOptionKey: null,
            chosenOptionKey: null,
            choiceSource: null,
            chosenAt: null,
            chosenById: null,
            createdAt: now,
          });
        }
        return { count: data.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) =>
        Object.assign(
          bookings.find((item) => item.id === where.id)!,
          data,
        ),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Row;
      }) => {
        const hit = bookings.filter((row) => matchesBooking(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = bookings.find((item) => item.id === where.id);
        if (!row) return null;
        const kase = cases.find((item) => item.id === row.caseId)!;
        return {
          ...row,
          reservation: reservations.find((item) => item.id === row.reservationId),
          case: { ...kase, options: options.filter((item) => item.caseId === kase.id) },
        };
      },
      findMany: async ({
        where,
      }: {
        where: { reservation: { userId: string; id?: string } };
      }) =>
        bookings
          .filter((row) => row.offerSentAt !== null)
          .filter((row) => {
            const reservation = reservations.find(
              (item) => item.id === row.reservationId,
            )!;
            return (
              reservation.userId === where.reservation.userId &&
              (!where.reservation.id || reservation.id === where.reservation.id) &&
              cases.find((item) => item.id === row.caseId)?.status === 'OPEN'
            );
          })
          .map((row) => {
            const kase = cases.find((item) => item.id === row.caseId)!;
            return {
              ...row,
              reservation: reservations.find((item) => item.id === row.reservationId),
              case: {
                ...kase,
                options: options.filter((item) => item.caseId === kase.id),
              },
            };
          }),
    },
    reservation: {
      findMany: async ({
        where,
      }: {
        where: { id?: { in: string[] }; bookingCode?: { in: string[] } };
      }) =>
        reservations.filter((row) => {
          if (where.id) return where.id.in.includes(row.id);
          if (where.bookingCode)
            return where.bookingCode.in.includes(String(row.bookingCode));
          // The suggestion query: this suite's case has no province.
          return false;
        }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => user(where.id),
    },
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        audits.push({ ...data, id: uuid(), createdAt: now });
        return data;
      },
      createMany: async ({ data }: { data: Row[] }) => {
        data.forEach((item) => audits.push({ ...item, id: uuid(), createdAt: now }));
        return { count: data.length };
      },
      findMany: async ({ where }: { where: { action?: string; entityId?: string } }) =>
        audits
          .filter(
            (row) =>
              (!where.action || row.action === where.action) &&
              (!where.entityId || row.entityId === where.entityId),
          )
          .map((row) => ({ ...row, actor: user(row.actorUserId) })),
    },
    $transaction: async (work: unknown) =>
      typeof work === 'function'
        ? (work as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(work as Promise<unknown>[]),
  };
  return prisma;
}

class FakeMailer implements Mailer {
  sent: EmailMessage[] = [];
  failNext = false;
  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('SMTP down');
    }
    this.sent.push(message);
  }
}

describe('DisruptionsService', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let mailer: FakeMailer;
  let service: DisruptionsService;
  const now = new Date();

  beforeEach(() => {
    prisma = fakePrisma(now);
    mailer = new FakeMailer();
    service = new DisruptionsService(
      prisma as unknown as PrismaService,
      {} as AdvisoriesService,
      mailer,
      tenant,
    );
  });

  const open = () =>
    service.create(ANA, {
      scenario: 'outage',
      severity: 'MAJOR',
      province: null,
      title: 'Power outage · Viñales',
      summary: 'Province-wide outage since last night.',
      reservationIds: [RES_HOLM, RES_OTHER],
    });

  const send = (caseId: string, deadline = new Date(now.getTime() + 4 * 3_600_000)) =>
    service.sendOptions(ANA, caseId, {
      deadline,
      defaultOptionKey: 'A',
      reservationIds: [RES_HOLM, RES_OTHER],
    });

  it('copies the scenario playbook when a case opens, and logs it against the case', async () => {
    const opened = await open();
    expect(opened.reference).toBe('DC-0001');
    expect(opened.steps.map((step) => step.text)).toEqual([
      'Confirm safety',
      'Confirm generator',
    ]);
    expect(opened.options.map((option) => option.key)).toEqual(['A', 'B']);
    expect(opened.policy).toBe('Meal vouchers for outages over 12 h.');
    expect(opened.ownerName).toBe('Ana R.');
    expect(opened.counts).toMatchObject({
      affected: 2,
      onTheGround: 1,
      arriving: 1,
      unknown: 2,
    });
    expect(prisma.audits.map((row) => row.action)).toEqual([
      'disruption.opened',
      'disruption.booking_attached',
      'disruption.booking_attached',
    ]);
    expect(prisma.audits.every((row) => row.entityType === 'DisruptionCase')).toBe(true);
  });

  it('refuses a scenario the manifest does not define', async () => {
    await expect(
      service.create(ANA, {
        scenario: 'volcano',
        severity: 'MINOR',
        province: null,
        title: 'x',
        summary: 'y',
        reservationIds: [],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('emails E-Options once per booking and offer, retrying only a failed send', async () => {
    const opened = await open();
    mailer.failNext = true;
    await send(opened.id);
    expect(mailer.sent).toHaveLength(1);
    expect(await service.deliver(opened.id)).toBe(1);
    expect(await service.deliver(opened.id)).toBe(0);
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent.map((mail) => mail.to).sort()).toEqual([HOLM.email, OTHER.email]);
    expect(mailer.sent[0]!.text).toContain('A · Stay at the casa: No change to price');
    expect(
      prisma.audits.filter((row) => row.action === 'disruption.options_delivered'),
    ).toHaveLength(2);
  });

  it('fixes the option set once it was sent', async () => {
    const opened = await open();
    await send(opened.id);
    await expect(
      service.writeOptions(ANA, opened.id, {
        options: [{ key: 'A', title: 'Changed', detail: 'Changed' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets the traveler choose once on their own booking, and the desk see it', async () => {
    const opened = await open();
    await send(opened.id);
    const [offer] = await service.mine(HOLM, {});
    expect(offer).toMatchObject({ bookingCode: 'VX6RQ4JD', offerState: 'AWAITING' });

    await expect(service.choose(OTHER, offer!.id, 'B')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const chosen = await service.choose(HOLM, offer!.id, 'B');
    expect(chosen).toMatchObject({ chosenOptionKey: 'B', choiceSource: 'TRAVELER' });
    await expect(service.choose(HOLM, offer!.id, 'A')).rejects.toBeInstanceOf(
      ConflictException,
    );

    const desk = await service.get(opened.id);
    const holm = desk.bookings.find((row) => row.reservationId === RES_HOLM)!;
    expect(holm).toMatchObject({
      chosenOptionKey: 'B',
      offerState: 'CHOSEN',
      needsCall: false,
    });
    expect(desk.log.some((row) => row.action === 'disruption.choice_recorded')).toBe(
      true,
    );
  });

  it('keeps the default after the deadline on read and puts the booking on the call list', async () => {
    const opened = await open();
    await send(opened.id);
    // The deadline passes: nothing writes the default.
    prisma.bookings.forEach((row) => {
      row.offerDeadline = new Date(now.getTime() - 60_000);
    });
    const [offer] = await service.mine(HOLM, {});
    expect(offer!.effectiveChoice).toEqual({
      key: 'A',
      source: 'DEFAULT',
      derived: true,
    });
    await expect(service.choose(HOLM, offer!.id, 'B')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const desk = await service.get(opened.id);
    expect(desk.counts.callNow).toBe(2);
    expect(prisma.bookings.every((row) => row.chosenOptionKey === null)).toBe(true);

    const confirmed = await service.recordDeskChoice(ANA, opened.id, RES_HOLM, {
      key: 'A',
      source: 'DEFAULT',
    });
    expect(confirmed.counts.callNow).toBe(1);
    await expect(
      service.recordDeskChoice(ANA, opened.id, RES_OTHER, {
        key: 'B',
        source: 'DEFAULT',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('records who marked a party safe and how, and keeps the note in the case log', async () => {
    const opened = await open();
    const marked = await service.markSafety(ANA, opened.id, RES_HOLM, {
      safety: 'SAFE',
      note: 'SMS reply: all fine',
    });
    const holm = marked.bookings.find((row) => row.reservationId === RES_HOLM)!;
    expect(holm).toMatchObject({
      safety: 'SAFE',
      safetyNote: 'SMS reply: all fine',
      safetyConfirmedByName: 'Ana R.',
    });
    expect(marked.counts.safe).toBe(1);
    const entry = prisma.audits.find((row) => row.action === 'disruption.safety_marked')!;
    expect(entry.metadata).toMatchObject({ reservationId: RES_HOLM, safety: 'SAFE' });
  });

  it('logs a severity change and refuses changes once the case is closed', async () => {
    const opened = await open();
    await service.update(ANA, opened.id, { severity: 'EMERGENCY' });
    const closed = await service.update(ANA, opened.id, { close: true });
    expect(closed.status).toBe('CLOSED');
    expect(prisma.audits.map((row) => row.action)).toContain(
      'disruption.severity_changed',
    );
    expect(prisma.audits.map((row) => row.action)).toContain('disruption.closed');
    await expect(
      service.markSafety(ANA, opened.id, RES_HOLM, { safety: 'SAFE' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await service.mine(HOLM, {})).toEqual([]);
  });
});
