import type { TenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import { describe, expect, it } from 'vitest';

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

function setup(options: { role: string; passkeys: number; required?: boolean }) {
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
    fakeOperatingSettings({ staffPasskeysRequired: options.required ?? true }),
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
