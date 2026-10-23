import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';
import { StaffService } from '../src/staff/staff.service';

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
  const audits: Record<string, unknown>[] = [];
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
    _count: { passkeys: 0, reservations: user.reservations },
    sessions: sessions.get(user.id)
      ? [{ createdAt: new Date('2026-10-23T08:00:00Z') }]
      : [],
    supplierProfile: user.supplier ? { id: 's-1' } : null,
  });
  const prisma = {
    users,
    invites,
    sessions,
    audits,
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
    service = new StaffService(prisma as unknown as PrismaService, mailer, tenant);
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

  it('deactivates a user, ending their sessions, but never the last Super Admin or oneself', async () => {
    const ana = await service.deactivate(DAYANA, 'u-ana');
    expect(ana.deactivatedAt).not.toBeNull();
    expect(prisma.sessions.has('u-ana')).toBe(false);
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
