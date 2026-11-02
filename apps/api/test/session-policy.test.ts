import type { TenantConfig } from '@ota/config';
import type { OperatingThresholds } from '@ota/domain';
import type { EmailMessage, Mailer } from '@ota/email';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionPolicy } from '../src/auth/session-policy';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

const TENANT = {
  primaryLocale: 'en',
  branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
} as unknown as TenantConfig;

class FakeMailer implements Mailer {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

function setup(options: {
  role: string;
  passkeys: number;
  required?: boolean;
  thresholds?: Partial<OperatingThresholds>;
}) {
  const audits: Record<string, unknown>[] = [];
  const prisma = {
    user: {
      findUnique: async () => ({ role: options.role, email: 'ana@vereda.travel' }),
    },
    passkey: { count: async () => options.passkeys },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const mailer = new FakeMailer();
  const policy = new SessionPolicy(
    prisma as unknown as PrismaService,
    fakeOperatingSettings({
      staffPasskeysRequired: options.required ?? true,
      ...options.thresholds,
    }),
    mailer,
    TENANT,
  );
  return { policy, audits, mailer };
}

describe('SessionPolicy: Better Auth asks before a passkey changes (P4)', () => {
  it('lets a staff member add the first passkey from a link session, and nothing else', async () => {
    const first = setup({ role: 'OPERATIONS_ADMIN', passkeys: 0 });
    expect(
      await first.policy.changeRefusal({
        userId: 'u-ana',
        signInMethod: 'magic_link',
        change: 'register',
      }),
    ).toBeNull();

    const enrolled = setup({ role: 'OPERATIONS_ADMIN', passkeys: 1 });
    for (const change of ['register', 'rename', 'delete'] as const) {
      expect(
        await enrolled.policy.changeRefusal({
          userId: 'u-ana',
          signInMethod: 'magic_link',
          change,
        }),
      ).toBe('Sign in with a passkey to change your passkeys');
    }
  });

  it('keeps the last passkey while the rule is on', async () => {
    const { policy } = setup({ role: 'SUPER_ADMIN', passkeys: 1 });
    expect(
      await policy.changeRefusal({
        userId: 'u-ana',
        signInMethod: 'passkey',
        change: 'delete',
      }),
    ).toBe('Staff must sign in with a passkey, so the last one stays');
  });

  it('does not limit a traveler', async () => {
    const { policy } = setup({ role: 'TRAVELER', passkeys: 1 });
    expect(
      await policy.changeRefusal({
        userId: 'u-holm',
        signInMethod: 'magic_link',
        change: 'delete',
      }),
    ).toBeNull();
  });
});

describe('SessionPolicy: a changed passkey is recorded (P4)', () => {
  it('audits an added passkey and emails the work address', async () => {
    const { policy, audits, mailer } = setup({ role: 'OPERATIONS_ADMIN', passkeys: 1 });
    await policy.passkeyChanged({
      userId: 'u-ana',
      change: 'added',
      passkeyId: 'pk-1',
      name: 'Office laptop',
    });
    expect(audits).toEqual([
      {
        actorUserId: 'u-ana',
        action: 'auth.passkey_added',
        entityType: 'User',
        entityId: 'u-ana',
        metadata: { passkeyId: 'pk-1' },
      },
    ]);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('ana@vereda.travel');
    expect(mailer.sent[0]!.text).toContain('named “Office laptop” was added');
  });

  it('audits a removed passkey', async () => {
    const { policy, audits } = setup({ role: 'SUPER_ADMIN', passkeys: 1 });
    await policy.passkeyChanged({
      userId: 'u-ana',
      change: 'removed',
      passkeyId: 'pk-2',
      name: null,
    });
    expect(audits[0]).toMatchObject({ action: 'auth.passkey_removed' });
  });

  it('leaves a traveler’s passkeys out of the staff audit', async () => {
    const { policy, audits, mailer } = setup({ role: 'TRAVELER', passkeys: 1 });
    await policy.passkeyChanged({
      userId: 'u-holm',
      change: 'added',
      passkeyId: 'pk-3',
      name: null,
    });
    expect(audits).toEqual([]);
    expect(mailer.sent).toEqual([]);
  });
});

describe('SessionPolicy: a recovery-code session (docs/schema-m9-recovery-codes.md R3)', () => {
  const SIGNED_IN = new Date('2026-11-01T10:00:00Z');
  const session = (signInMethod: string) =>
    ({
      user: { id: 'u-ana', email: 'ana@vereda.travel', role: 'OPERATIONS_ADMIN' },
      session: {
        id: 's-1',
        userId: 'u-ana',
        expiresAt: new Date('2026-11-08T10:00:00Z'),
        createdAt: SIGNED_IN,
        lastActiveAt: SIGNED_IN,
        ownDevice: true,
        signInMethod,
      },
    }) as Parameters<SessionPolicy['refusal']>[0];
  const at = (minutes: number) => new Date(SIGNED_IN.getTime() + minutes * 60_000);

  it('may only set up a passkey, even while the passkey rule is off', async () => {
    const { policy } = setup({ role: 'OPERATIONS_ADMIN', passkeys: 0, required: false });
    expect(await policy.refusal(session('recovery_code'), at(1))).toMatchObject({
      kind: 'enroll',
    });
    // A link session is untouched while the rule is off.
    expect(await policy.refusal(session('magic_link'), at(1))).toBeNull();
    // Better Auth's routes stay open to it, so it can add the passkey.
    expect(await policy.gateRefusal(session('recovery_code'), at(1))).toBeNull();
  });

  it('asks for a passkey sign-in once one is set up', async () => {
    const { policy } = setup({ role: 'OPERATIONS_ADMIN', passkeys: 1, required: false });
    expect(await policy.refusal(session('recovery_code'), at(2))).toMatchObject({
      kind: 'use_passkey',
    });
  });

  it('ends 15 minutes after the code signed in, Better Auth’s routes included', async () => {
    const { policy } = setup({ role: 'OPERATIONS_ADMIN', passkeys: 0, required: false });
    expect(await policy.refusal(session('recovery_code'), at(15))).toEqual({
      kind: 'session',
      message: 'The recovery session ended; ask a Super Admin for a new code',
    });
    expect(await policy.gateRefusal(session('recovery_code'), at(15))).toMatchObject({
      code: 'SESSION_REFUSED',
    });
  });
});

describe('SessionPolicy: the Super Admin IP allowlist (docs/schema-m9-ip-allowlist.md I1, I3, I4)', () => {
  const SIGNED_IN = new Date('2026-11-02T10:00:00Z');
  const ALLOWLIST = {
    superAdminIpAllowlistOn: true,
    superAdminIpAllowlist: [{ label: 'Havana office', cidr: '203.0.113.0/24' }],
  };
  const session = (role: string, ipAddress: string | null) =>
    ({
      user: { id: 'u-yanet', email: 'yanet@vereda.travel', role },
      session: {
        id: 's-1',
        userId: 'u-yanet',
        expiresAt: new Date('2026-11-09T10:00:00Z'),
        createdAt: SIGNED_IN,
        lastActiveAt: SIGNED_IN,
        ownDevice: true,
        signInMethod: 'passkey',
        ipAddress,
      },
    }) as Parameters<SessionPolicy['refusal']>[0];
  const at = new Date(SIGNED_IN.getTime() + 60_000);

  afterEach(() => vi.unstubAllEnvs());

  it('refuses a Super Admin session signed in from outside the list, naming the address', async () => {
    const { policy } = setup({ role: 'SUPER_ADMIN', passkeys: 1, thresholds: ALLOWLIST });
    expect(await policy.refusal(session('SUPER_ADMIN', '198.51.100.7'), at)).toEqual({
      kind: 'ip_not_allowed',
      message:
        "Super Admin sign-ins are only accepted from the agency's listed addresses; this one came from 198.51.100.7",
      ipAddress: '198.51.100.7',
    });
    // Better Auth's own routes (passkeys among them) refuse it too.
    expect(await policy.gateRefusal(session('SUPER_ADMIN', '198.51.100.7'), at)).toMatchObject({
      code: 'IP_NOT_ALLOWED',
    });
  });

  it('refuses a Super Admin session with no recorded address', async () => {
    const { policy } = setup({ role: 'SUPER_ADMIN', passkeys: 1, thresholds: ALLOWLIST });
    expect(await policy.refusal(session('SUPER_ADMIN', null), at)).toMatchObject({
      kind: 'ip_not_allowed',
      ipAddress: null,
    });
  });

  it('lets a listed address through, and never touches another role', async () => {
    const { policy } = setup({ role: 'SUPER_ADMIN', passkeys: 1, thresholds: ALLOWLIST });
    expect(await policy.refusal(session('SUPER_ADMIN', '203.0.113.9'), at)).toBeNull();
    expect(await policy.gateRefusal(session('SUPER_ADMIN', '203.0.113.9'), at)).toBeNull();
    expect(await policy.refusal(session('OPERATIONS_ADMIN', '198.51.100.7'), at)).toBeNull();
  });

  it('refuses nobody while switched off or suspended by the break-glass', async () => {
    const off = setup({
      role: 'SUPER_ADMIN',
      passkeys: 1,
      thresholds: { ...ALLOWLIST, superAdminIpAllowlistOn: false },
    });
    expect(await off.policy.refusal(session('SUPER_ADMIN', '198.51.100.7'), at)).toBeNull();
    vi.stubEnv('SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE', 'off');
    const suspended = setup({ role: 'SUPER_ADMIN', passkeys: 1, thresholds: ALLOWLIST });
    expect(
      await suspended.policy.refusal(session('SUPER_ADMIN', '198.51.100.7'), at),
    ).toBeNull();
  });
});
