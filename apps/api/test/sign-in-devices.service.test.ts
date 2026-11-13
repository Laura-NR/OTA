import { parseTenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import type { OperatingThresholds } from '@ota/domain';
import { describe, expect, it } from 'vitest';

import { SessionPolicy } from '../src/auth/session-policy';
import {
  SignInDevicesService,
  hashDeviceToken,
} from '../src/auth/sign-in-devices.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

const tenant = parseTenantConfig({
  tenantId: 'vereda',
  branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
  primaryLocale: 'en',
});

const NOW = new Date('2026-11-01T14:05:00Z');
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0';
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface Device {
  userId: string;
  tokenHash: string;
  label: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

function fakePrisma() {
  const users = [
    {
      id: 'u-ana',
      email: 'ana@vereda.travel',
      role: 'OPERATIONS_ADMIN',
      deactivatedAt: null,
    },
    {
      id: 'u-yanet',
      email: 'yanet@vereda.travel',
      role: 'SUPER_ADMIN',
      deactivatedAt: null,
    },
    {
      id: 'u-margaret',
      email: 'margaret@example.test',
      role: 'TRAVELER',
      deactivatedAt: null,
    },
    {
      id: 'u-gone',
      email: 'gone@vereda.travel',
      role: 'OPERATIONS_ADMIN',
      deactivatedAt: new Date('2026-10-01T00:00:00Z'),
    },
  ];
  const devices: Device[] = [];
  const audits: Record<string, unknown>[] = [];
  return {
    devices,
    audits,
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((user) => user.id === where.id) ?? null,
    },
    staffKnownDevice: {
      deleteMany: async ({
        where,
      }: {
        where: { userId: string; lastSeenAt: { lt: Date } };
      }) => {
        const stale = devices.filter(
          (device) =>
            device.userId === where.userId && device.lastSeenAt < where.lastSeenAt.lt,
        );
        for (const device of stale) devices.splice(devices.indexOf(device), 1);
        return { count: stale.length };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash: string };
        data: { lastSeenAt: Date };
      }) => {
        const found = devices.filter((device) => device.tokenHash === where.tokenHash);
        for (const device of found) device.lastSeenAt = data.lastSeenAt;
        return { count: found.length };
      },
      create: async ({ data }: { data: Device }) => {
        devices.push({ ...data });
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };
}

class FakeMailer implements Mailer {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

function setup(enabled = true, thresholds: Partial<OperatingThresholds> = {}) {
  const prisma = fakePrisma();
  const mailer = new FakeMailer();
  const settings = fakeOperatingSettings({ staffNewDeviceEmail: enabled, ...thresholds });
  const service = new SignInDevicesService(
    prisma as unknown as PrismaService,
    settings,
    mailer,
    tenant,
    new SessionPolicy(prisma as unknown as PrismaService, settings, mailer, tenant),
  );
  const signIn = (
    userId: string,
    deviceToken: string | null,
    options: { userAgent?: string; at?: Date; ipAddress?: string } = {},
  ) =>
    service.signedIn(
      {
        userId,
        deviceToken,
        userAgent: options.userAgent ?? FIREFOX,
        ipAddress: options.ipAddress ?? '203.0.113.7',
        signInMethod: 'magic_link',
      },
      options.at ?? NOW,
    );
  return { prisma, mailer, signIn };
}

/** The email is sent without holding up the sign-in; let it go out. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('the new-device email (docs/schema-m9-new-device-email.md)', () => {
  it('emails and audits a staff sign-in from a browser not seen before, the first one included', async () => {
    const { prisma, mailer, signIn } = setup();
    const token = await signIn('u-ana', null);
    await settle();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Only a hash of the person and the cookie is stored.
    expect(prisma.devices).toEqual([
      expect.objectContaining({
        userId: 'u-ana',
        tokenHash: hashDeviceToken('u-ana', token!),
        label: 'Firefox · Linux',
      }),
    ]);
    expect(JSON.stringify(prisma.devices)).not.toContain(token);
    expect(prisma.audits).toEqual([
      expect.objectContaining({
        actorUserId: 'u-ana',
        action: 'auth.new_device_sign_in',
        entityId: 'u-ana',
        metadata: {
          device: 'Firefox · Linux',
          ipAddress: '203.0.113.7',
          signInMethod: 'magic_link',
        },
      }),
    ]);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: 'ana@vereda.travel',
      subject: 'New sign-in to your Vereda desk account',
    });
    expect(mailer.sent[0]!.text).toContain('Device: Firefox · Linux');
    expect(mailer.sent[0]!.text).toContain('Signed in with: a sign-in link');
  });

  it('is silent for a browser already known, and keeps its cookie', async () => {
    const { prisma, mailer, signIn } = setup();
    const token = await signIn('u-ana', null);
    const later = new Date(NOW.getTime() + 60 * 60_000);
    expect(await signIn('u-ana', token, { at: later })).toBe(token);
    await settle();
    expect(mailer.sent).toHaveLength(1);
    expect(prisma.audits).toHaveLength(1);
    expect(prisma.devices[0]!.lastSeenAt).toEqual(later);
  });

  it('knows one shared browser for each staff member separately', async () => {
    const { prisma, mailer, signIn } = setup();
    const token = await signIn('u-ana', null);
    // Yanet signs in on Ana's browser: new for her, and Ana's record stays.
    expect(await signIn('u-yanet', token)).toBe(token);
    expect(await signIn('u-ana', token)).toBe(token);
    await settle();
    expect(prisma.devices.map((device) => device.userId)).toEqual(['u-ana', 'u-yanet']);
    expect(mailer.sent.map((message) => message.to)).toEqual([
      'ana@vereda.travel',
      'yanet@vereda.travel',
    ]);
  });

  it('treats a cookie it never issued as a new browser', async () => {
    const { prisma, mailer, signIn } = setup();
    const token = await signIn('u-ana', 'not-a-device-token');
    await settle();
    expect(token).not.toBe('not-a-device-token');
    expect(prisma.devices).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it('forgets a browser unseen for 180 days, so its next sign-in is new again', async () => {
    const { prisma, mailer, signIn } = setup();
    const token = await signIn('u-ana', null, { userAgent: CHROME });
    const halfYear = new Date(NOW.getTime() + 181 * 24 * 60 * 60_000);
    expect(await signIn('u-ana', token, { at: halfYear })).toBe(token);
    await settle();
    expect(prisma.devices).toHaveLength(1);
    expect(prisma.devices[0]!.firstSeenAt).toEqual(halfYear);
    expect(mailer.sent).toHaveLength(2);
  });

  it('still records and audits, but sends nothing, while the switch is off', async () => {
    const { prisma, mailer, signIn } = setup(false);
    const token = await signIn('u-ana', null);
    await settle();
    expect(token).not.toBeNull();
    expect(prisma.devices).toHaveLength(1);
    expect(prisma.audits).toHaveLength(1);
    expect(mailer.sent).toHaveLength(0);
  });

  it('leaves travelers, unknown and deactivated accounts alone', async () => {
    const { prisma, mailer, signIn } = setup();
    expect(await signIn('u-margaret', null)).toBeNull();
    expect(await signIn('u-gone', null)).toBeNull();
    expect(await signIn('u-nobody', null)).toBeNull();
    await settle();
    expect(prisma.devices).toHaveLength(0);
    expect(prisma.audits).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe('a Super Admin sign-in outside the IP allowlist (docs/schema-m9-ip-allowlist.md I3)', () => {
  const allowlist = {
    superAdminIpAllowlistOn: true,
    superAdminIpAllowlist: [{ label: 'Havana office', cidr: '203.0.113.0/24' }],
  };
  const actions = (audits: Record<string, unknown>[]) =>
    audits.map((audit) => audit.action);

  it('is audited with its address and method, and still reported as a new device', async () => {
    const { prisma, signIn } = setup(true, allowlist);
    await signIn('u-yanet', null, { ipAddress: '198.51.100.7' });
    expect(prisma.audits[0]).toMatchObject({
      actorUserId: 'u-yanet',
      action: 'auth.sign_in_outside_allowlist',
      entityId: 'u-yanet',
      metadata: { ipAddress: '198.51.100.7', signInMethod: 'magic_link' },
    });
    expect(actions(prisma.audits)).toEqual([
      'auth.sign_in_outside_allowlist',
      'auth.new_device_sign_in',
    ]);
  });

  it('is not audited from a listed address, for another role, or with the rule off', async () => {
    const listed = setup(true, allowlist);
    await listed.signIn('u-yanet', null, { ipAddress: '203.0.113.9' });
    const otherRole = setup(true, allowlist);
    await otherRole.signIn('u-ana', null, { ipAddress: '198.51.100.7' });
    const off = setup(true, { ...allowlist, superAdminIpAllowlistOn: false });
    await off.signIn('u-yanet', null, { ipAddress: '198.51.100.7' });
    for (const run of [listed, otherRole, off]) {
      expect(actions(run.prisma.audits)).toEqual(['auth.new_device_sign_in']);
    }
  });
});
