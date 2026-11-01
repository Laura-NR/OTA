import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { RecoveryCodesService } from '../src/auth/recovery-codes.service';
import { SessionPolicy } from '../src/auth/session-policy';
import type { PrismaService } from '../src/prisma/prisma.service';
import { StaffService } from '../src/staff/staff.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

const DAYANA: AuthUser = {
  id: 'u-dayana',
  email: 'dayana@vereda.travel',
  role: 'SUPER_ADMIN',
};
const FOUNDER: AuthUser = {
  id: 'u-founder',
  email: 'founder@vereda.travel',
  role: 'SUPER_ADMIN',
};

const tenant = parseTenantConfig({
  tenantId: 'vereda',
  branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
  primaryLocale: 'en',
  staff: { allowedEmailDomains: ['vereda.travel'] },
});

interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  deactivatedAt: Date | null;
  createdAt: Date;
  reservations: number;
  supplier: boolean;
}

interface RecoveryCode {
  id: string;
  userId: string;
  codeHash: string;
  issuedById: string | null;
  expiresAt: Date;
  failedAttempts: number;
  usedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
}

type Invite = Record<string, unknown> & {
  id: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
};

/** Just enough Prisma for staff users and invitations, in memory. */
function fakePrisma() {
  const users: User[] = [
    { id: DAYANA.id, email: DAYANA.email, fullName: 'Dayana', role: 'SUPER_ADMIN' },
    { id: FOUNDER.id, email: FOUNDER.email, fullName: 'Founder', role: 'SUPER_ADMIN' },
    {
      id: 'u-ana',
      email: 'ana@vereda.travel',
      fullName: 'Ana',
      role: 'OPERATIONS_ADMIN',
    },
    { id: 'u-traveler', email: 'holm@example.test', fullName: 'Holm', role: 'TRAVELER' },
  ].map((user) => ({
    deactivatedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    reservations: 0,
    supplier: false,
    ...user,
  }));
  const invites: Invite[] = [];
  const sessions = new Map<string, number>([
    ['u-ana', 2],
    [FOUNDER.id, 1],
  ]);
  const passkeys = new Map<string, number>([['u-ana', 2]]);
  const devices = new Map<string, number>([['u-ana', 1]]);
  const audits: Record<string, unknown>[] = [];
  const codes: RecoveryCode[] = [];
  const isOpen = (code: RecoveryCode, now = new Date()) =>
    code.usedAt === null && code.withdrawnAt === null && code.expiresAt > now;
  type CodeWhere = {
    id?: string;
    userId?: string;
    usedAt?: null;
    withdrawnAt?: null;
    expiresAt?: { gt: Date };
  };
  const codeMatches = (code: RecoveryCode, where: CodeWhere) =>
    (!where.id || code.id === where.id) &&
    (!where.userId || code.userId === where.userId) &&
    (!('usedAt' in where) || code.usedAt === null) &&
    (!('withdrawnAt' in where) || code.withdrawnAt === null) &&
    (!where.expiresAt || code.expiresAt > where.expiresAt.gt);
  let sequence = 0;
  const person = (id: unknown) => {
    const user = users.find((item) => item.id === id);
    return user ? { fullName: user.fullName, email: user.email } : null;
  };
  const inviteView = (invite: Invite) => ({
    ...invite,
    invitedBy: person(invite.invitedById),
    confirmedBy: person(invite.confirmedById),
  });
  const userView = (user: User) => ({
    ...user,
    _count: { passkeys: passkeys.get(user.id) ?? 0, reservations: user.reservations },
    sessions: sessions.get(user.id)
      ? [{ createdAt: new Date('2026-10-23T08:00:00Z') }]
      : [],
    supplierProfile: user.supplier ? { id: 's-1' } : null,
    recoveryCodes: codes
      .filter((code) => code.userId === user.id && isOpen(code))
      .map((code) => ({ expiresAt: code.expiresAt })),
  });
  const prisma = {
    users,
    invites,
    sessions,
    passkeys,
    devices,
    audits,
    codes,
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const user = users.find((item) =>
          where.id ? item.id === where.id : item.email === where.email,
        );
        return user ? userView(user) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        userView(users.find((item) => item.id === where.id)!),
      findMany: async ({
        where,
      }: {
        where: { role: string | { in: string[] }; deactivatedAt?: null };
      }) =>
        users
          .filter((user) =>
            typeof where.role === 'string'
              ? user.role === where.role
              : where.role.in.includes(user.role),
          )
          .filter((user) => !('deactivatedAt' in where) || user.deactivatedAt === null)
          .map(userView),
      update: async ({ where, data }: { where: { id: string }; data: Partial<User> }) =>
        Object.assign(
          users.find((item) => item.id === where.id)!,
          data,
        ),
    },
    staffInvite: {
      findMany: async ({
        where,
      }: { where?: { email?: string; acceptedAt?: null } } = {}) =>
        invites
          .filter((invite) => !where?.email || invite.email === where.email)
          .filter(
            (invite) =>
              !where ||
              !('acceptedAt' in where) ||
              (invite.acceptedAt === null &&
                invite.revokedAt === null &&
                invite.expiresAt > new Date()),
          )
          .map(inviteView),
      findUnique: async ({ where }: { where: { id?: string; tokenHash?: string } }) =>
        invites.find((invite) =>
          where.id ? invite.id === where.id : invite.tokenHash === where.tokenHash,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const invite = {
          id: `00000000-0000-4000-8000-${String((sequence += 1)).padStart(12, '0')}`,
          confirmedById: null,
          confirmedAt: null,
          acceptedAt: null,
          acceptedById: null,
          revokedAt: null,
          createdAt: new Date(),
          ...data,
        } as Invite;
        invites.push(invite);
        return inviteView(invite);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) =>
        inviteView(
          Object.assign(
            invites.find((invite) => invite.id === where.id)!,
            data,
          ),
        ),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const invite = invites.find(
          (item) =>
            item.id === where.id && item.acceptedAt === null && item.revokedAt === null,
        );
        if (!invite) return { count: 0 };
        Object.assign(invite, data);
        return { count: 1 };
      },
    },
    session: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const count = sessions.get(where.userId) ?? 0;
        sessions.delete(where.userId);
        return { count };
      },
    },
    passkey: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const count = passkeys.get(where.userId) ?? 0;
        passkeys.delete(where.userId);
        return { count };
      },
    },
    staffKnownDevice: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const count = devices.get(where.userId) ?? 0;
        devices.delete(where.userId);
        return { count };
      },
    },
    staffRecoveryCode: {
      findFirst: async ({ where }: { where: CodeWhere }) =>
        codes
          .filter((code) => codeMatches(code, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      create: async ({ data }: { data: Partial<RecoveryCode> }) => {
        const code: RecoveryCode = {
          id: `rc-${(sequence += 1)}`,
          userId: '',
          codeHash: '',
          issuedById: null,
          expiresAt: new Date(),
          failedAttempts: 0,
          usedAt: null,
          withdrawnAt: null,
          createdAt: new Date(),
          ...data,
        };
        codes.push(code);
        return code;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { failedAttempts: { increment: number } };
      }) => {
        const code = codes.find((item) => item.id === where.id)!;
        code.failedAttempts += data.failedAttempts.increment;
        return code;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: CodeWhere;
        data: Partial<RecoveryCode>;
      }) => {
        const matched = codes.filter((code) => codeMatches(code, where));
        for (const code of matched) Object.assign(code, data);
        return { count: matched.length };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> =>
      work(prisma),
  };
  return prisma;
}

class FakeMailer implements Mailer {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

const tokenOf = (message: EmailMessage) =>
  decodeURIComponent(/token=([^\s"&<]+)/.exec(message.text)![1]!);

describe('StaffService (M9 D4, D5)', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let mailer: FakeMailer;
  let service: StaffService;

  beforeEach(() => {
    prisma = fakePrisma();
    mailer = new FakeMailer();
    service = new StaffService(
      prisma as unknown as PrismaService,
      mailer,
      tenant,
      new SessionPolicy(
        prisma as unknown as PrismaService,
        fakeOperatingSettings(),
        mailer,
        tenant,
      ),
    );
  });

  it('invites a work address, emails a single-use link, and the new account accepts it', async () => {
    const invite = await service.invite(DAYANA, {
      email: 'yanet@vereda.travel',
      role: 'ADMINISTRATIVE_SUPPORT',
    });
    expect(invite).toMatchObject({ state: 'SENT', invitedByName: 'Dayana' });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.text).toContain('as Administrative Support');
    const token = tokenOf(mailer.sent[0]!);
    // Only the hash is stored.
    expect(prisma.invites[0]!.tokenHash).not.toContain(token);

    // The invitee signs in with the magic link: a fresh account.
    prisma.users.push({
      id: 'u-yanet',
      email: 'yanet@vereda.travel',
      fullName: null,
      role: 'TRAVELER',
      deactivatedAt: null,
      createdAt: new Date(),
      reservations: 0,
      supplier: false,
    });
    const yanet: AuthUser = {
      id: 'u-yanet',
      email: 'yanet@vereda.travel',
      role: 'TRAVELER',
    };
    await expect(service.accept(DAYANA, token)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await service.accept(yanet, token)).toEqual({
      role: 'ADMINISTRATIVE_SUPPORT',
    });
    expect(prisma.users.find((user) => user.id === 'u-yanet')!.role).toBe(
      'ADMINISTRATIVE_SUPPORT',
    );
    await expect(service.accept(yanet, token)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses another domain, a traveler account and a second open invite', async () => {
    await expect(
      service.invite(DAYANA, { email: 'yanet@gmail.com', role: 'OPERATIONS_ADMIN' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.invite(DAYANA, {
        email: 'ana@vereda.travel',
        role: 'ADMINISTRATIVE_SUPPORT',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await service.invite(DAYANA, {
      email: 'yanet@vereda.travel',
      role: 'OPERATIONS_ADMIN',
    });
    await expect(
      service.invite(FOUNDER, { email: 'yanet@vereda.travel', role: 'OPERATIONS_ADMIN' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sends a Super Admin invite only once a second Super Admin confirms it', async () => {
    const invite = await service.invite(DAYANA, {
      email: 'ana@vereda.travel',
      role: 'SUPER_ADMIN',
    });
    expect(invite.state).toBe('AWAITING_CONFIRMATION');
    expect(mailer.sent).toHaveLength(0);
    await expect(service.confirm(DAYANA, invite.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const confirmed = await service.confirm(FOUNDER, invite.id);
    expect(confirmed).toMatchObject({ state: 'SENT', confirmedByName: 'Founder' });
    expect(mailer.sent).toHaveLength(1);

    // Ana, already on the desk, accepts her promotion.
    const ana: AuthUser = {
      id: 'u-ana',
      email: 'ana@vereda.travel',
      role: 'OPERATIONS_ADMIN',
    };
    await service.accept(ana, tokenOf(mailer.sent[0]!));
    expect(prisma.users.find((user) => user.id === 'u-ana')!.role).toBe('SUPER_ADMIN');
  });

  it('refuses an invite to an account that has bookings', async () => {
    const invite = await service.invite(DAYANA, {
      email: 'new@vereda.travel',
      role: 'OPERATIONS_ADMIN',
    });
    prisma.users.push({
      id: 'u-new',
      email: 'new@vereda.travel',
      fullName: null,
      role: 'TRAVELER',
      deactivatedAt: null,
      createdAt: new Date(),
      reservations: 1,
      supplier: false,
    });
    await expect(
      service.accept(
        { id: 'u-new', email: 'new@vereda.travel', role: 'TRAVELER' },
        tokenOf(mailer.sent[0]!),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invite.state).toBe('SENT');
  });

  it('deactivates a user, ending their sessions and forgetting their devices, but never the last Super Admin or oneself', async () => {
    const ana = await service.deactivate(DAYANA, 'u-ana');
    expect(ana.deactivatedAt).not.toBeNull();
    expect(prisma.sessions.has('u-ana')).toBe(false);
    expect(prisma.devices.has('u-ana')).toBe(false);
    await expect(service.deactivate(DAYANA, DAYANA.id)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await service.deactivate(DAYANA, FOUNDER.id);
    // Dayana is now the only active Super Admin: nobody can deactivate or demote her.
    await expect(service.deactivate(FOUNDER, DAYANA.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.reactivate(DAYANA, FOUNDER.id);
    await service.deactivate(FOUNDER, DAYANA.id);
    // And now the founder is the last one.
    await expect(
      service.changeRole(DAYANA, FOUNDER.id, { role: 'OPERATIONS_ADMIN' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.audits.map((entry) => entry.action)).toContain('staff.deactivated');
  });

  it('resets a lost device: passkeys, sessions and known devices go, audited with the reason, and the user is told', async () => {
    const ana = await service.resetPasskeys(DAYANA, 'u-ana', { reason: 'Phone stolen' });
    expect(ana.passkeys).toBe(0);
    expect(prisma.passkeys.has('u-ana')).toBe(false);
    expect(prisma.sessions.has('u-ana')).toBe(false);
    // N6: the next sign-in from any browser is announced.
    expect(prisma.devices.has('u-ana')).toBe(false);
    expect(prisma.audits.at(-1)).toMatchObject({
      action: 'staff.passkeys_reset',
      entityId: 'u-ana',
      metadata: { reason: 'Phone stolen', passkeys: 2, sessions: 2, devices: 1 },
    });
    const email = mailer.sent.at(-1)!;
    expect(email.to).toBe('ana@vereda.travel');
    expect(email.subject).toBe('Your Vereda desk passkeys were reset');
    expect(email.text).toContain('Dayana removed every passkey');
    expect(email.html).toContain('http://localhost:3002/passkeys');
  });

  it('never resets one’s own passkeys, nor a non-staff account’s', async () => {
    await expect(
      service.resetPasskeys(DAYANA, DAYANA.id, { reason: 'Lost my phone' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.resetPasskeys(DAYANA, 'u-traveler', { reason: 'Lost phone' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.audits.map((entry) => entry.action)).not.toContain(
      'staff.passkeys_reset',
    );
  });

  it('moves a staff member between Operations Admin and Administrative Support, audited', async () => {
    const ana = await service.changeRole(DAYANA, 'u-ana', {
      role: 'ADMINISTRATIVE_SUPPORT',
    });
    expect(ana.role).toBe('ADMINISTRATIVE_SUPPORT');
    expect(prisma.audits.at(-1)).toMatchObject({
      action: 'staff.role_changed',
      metadata: { from: 'OPERATIONS_ADMIN', to: 'ADMINISTRATIVE_SUPPORT' },
    });
  });
});

describe('staff recovery codes (docs/schema-m9-recovery-codes.md)', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let mailer: FakeMailer;
  let service: StaffService;
  let recovery: RecoveryCodesService;

  beforeEach(() => {
    prisma = fakePrisma();
    mailer = new FakeMailer();
    const policy = new SessionPolicy(
      prisma as unknown as PrismaService,
      fakeOperatingSettings(),
      mailer,
      tenant,
    );
    service = new StaffService(
      prisma as unknown as PrismaService,
      mailer,
      tenant,
      policy,
    );
    recovery = new RecoveryCodesService(prisma as unknown as PrismaService, policy);
  });

  const issue = () =>
    service.issueRecoveryCode(DAYANA, 'u-ana', { reason: 'Mailbox locked' });
  const actions = () => prisma.audits.map((entry) => entry.action);

  it('issues a code shown once, stored as a hash, open 15 minutes, with both names and the reason', async () => {
    const before = Date.now();
    const issued = await issue();
    expect(issued.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
    const expiresIn = new Date(issued.expiresAt).getTime() - before;
    expect(expiresIn).toBeGreaterThan(14 * 60_000);
    expect(expiresIn).toBeLessThanOrEqual(15 * 60_000);
    expect(issued.user.recoveryCodeOpenUntil).toBe(issued.expiresAt);
    const [row] = prisma.codes;
    expect(row).toMatchObject({ userId: 'u-ana', issuedById: DAYANA.id });
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(prisma.codes)).not.toContain(issued.code.replace(/-/g, ''));
    expect(prisma.audits.at(-1)).toMatchObject({
      actorUserId: DAYANA.id,
      action: 'staff.recovery_code_issued',
      entityId: 'u-ana',
      metadata: {
        reason: 'Mailbox locked',
        passkeys: 2,
        sessions: 2,
        devices: 1,
        replaced: 0,
      },
    });
    const email = mailer.sent.at(-1)!;
    expect(email.to).toBe('ana@vereda.travel');
    expect(email.subject).toBe('A recovery code was issued for your Vereda desk account');
    expect(email.text).toContain('Dayana issued a one-time recovery code');
  });

  it('removes the person’s passkeys and sessions, since the code’s session may add only a first passkey', async () => {
    const issued = await issue();
    expect(issued.passkeysRemoved).toBe(2);
    expect(issued.user.passkeys).toBe(0);
    expect(prisma.passkeys.has('u-ana')).toBe(false);
    expect(prisma.sessions.has('u-ana')).toBe(false);
  });

  it('replaces an open code with a new one', async () => {
    const first = await issue();
    const second = await issue();
    expect(prisma.codes.filter((code) => code.withdrawnAt === null)).toHaveLength(1);
    expect(prisma.audits.at(-1)).toMatchObject({ metadata: { replaced: 1 } });
    expect(
      await recovery.redeem({ email: 'ana@vereda.travel', code: first.code }),
    ).toBeNull();
    expect(await recovery.redeem({ email: 'ana@vereda.travel', code: second.code })).toBe(
      'u-ana',
    );
  });

  it('is never issued for oneself, a traveler or a deactivated account', async () => {
    await expect(
      service.issueRecoveryCode(DAYANA, DAYANA.id, { reason: 'Locked out' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.issueRecoveryCode(DAYANA, 'u-traveler', { reason: 'Locked out' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.users.find((user) => user.id === 'u-ana')!.deactivatedAt = new Date();
    await expect(issue()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.codes).toHaveLength(0);
    expect(actions()).not.toContain('staff.recovery_code_issued');
  });

  it('is issued by one Super Admin for another Super Admin', async () => {
    const issued = await service.issueRecoveryCode(DAYANA, FOUNDER.id, {
      reason: 'Lost phone and mailbox',
    });
    expect(issued.user.id).toBe(FOUNDER.id);
  });

  it('signs in once, typed in any case and without hyphens, and tells the person', async () => {
    const issued = await issue();
    const typed = issued.code.replace(/-/g, '').toLowerCase();
    expect(await recovery.redeem({ email: 'ana@vereda.travel', code: typed })).toBe(
      'u-ana',
    );
    expect(prisma.codes[0]!.usedAt).toBeInstanceOf(Date);
    expect(prisma.audits.at(-1)).toMatchObject({
      actorUserId: 'u-ana',
      action: 'auth.recovery_code_used',
      entityId: 'u-ana',
    });
    expect(mailer.sent.at(-1)!.subject).toBe('Your Vereda desk recovery code was used');
    expect(
      await recovery.redeem({ email: 'ana@vereda.travel', code: issued.code }),
    ).toBeNull();
    expect(
      (await service.list()).find((user) => user.id === 'u-ana')!.recoveryCodeOpenUntil,
    ).toBeNull();
  });

  it('refuses another person’s email, a traveler and a deactivated account alike', async () => {
    const issued = await issue();
    for (const email of [
      'founder@vereda.travel',
      'holm@example.test',
      'nobody@vereda.travel',
    ]) {
      expect(await recovery.redeem({ email, code: issued.code })).toBeNull();
    }
    prisma.users.find((user) => user.id === 'u-ana')!.deactivatedAt = new Date();
    expect(
      await recovery.redeem({ email: 'ana@vereda.travel', code: issued.code }),
    ).toBeNull();
    expect(prisma.codes[0]!.usedAt).toBeNull();
  });

  it('refuses an expired code', async () => {
    const issued = await issue();
    const later = new Date(Date.parse(issued.expiresAt) + 1);
    expect(
      await recovery.redeem({ email: 'ana@vereda.travel', code: issued.code }, later),
    ).toBeNull();
  });

  it('withdraws the code at the fifth wrong try, after which the right one fails too', async () => {
    const issued = await issue();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(
        await recovery.redeem({ email: 'ana@vereda.travel', code: 'AAAA-AAAA-AAAA' }),
      ).toBeNull();
    }
    expect(prisma.codes[0]!.withdrawnAt).toBeNull();
    // Something that cannot be a code is a wrong try as well.
    expect(
      await recovery.redeem({ email: 'ana@vereda.travel', code: 'nope' }),
    ).toBeNull();
    expect(prisma.codes[0]).toMatchObject({ failedAttempts: 5 });
    expect(prisma.codes[0]!.withdrawnAt).toBeInstanceOf(Date);
    expect(prisma.audits.at(-1)).toMatchObject({
      action: 'auth.recovery_code_voided',
      entityId: 'u-ana',
      metadata: { failedAttempts: 5 },
    });
    expect(prisma.audits.at(-1)).not.toHaveProperty('actorUserId');
    expect(
      await recovery.redeem({ email: 'ana@vereda.travel', code: issued.code }),
    ).toBeNull();
  });

  it('is withdrawn by a Super Admin, audited; with none open there is nothing to withdraw', async () => {
    await issue();
    const ana = await service.withdrawRecoveryCode(DAYANA, 'u-ana');
    expect(ana.recoveryCodeOpenUntil).toBeNull();
    expect(prisma.audits.at(-1)).toMatchObject({
      actorUserId: DAYANA.id,
      action: 'staff.recovery_code_withdrawn',
      entityId: 'u-ana',
    });
    await expect(service.withdrawRecoveryCode(DAYANA, 'u-ana')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
