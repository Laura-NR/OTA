import type { TenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';

import { SessionPolicy } from '../../src/auth/session-policy';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { fakeOperatingSettings } from './operating-settings';

const TENANT = {
  primaryLocale: 'en',
  branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
} as unknown as TenantConfig;

/**
 * A session policy for tests that build services by hand: the staff passkey
 * switch as given (off by default) and `passkeys` passkeys for every user.
 */
export function fakeSessionPolicy(
  options: { required?: boolean; passkeys?: number; mailer?: Mailer } = {},
): SessionPolicy {
  const prisma = {
    passkey: {
      count: async () => options.passkeys ?? 0,
      findMany: async () => [],
    },
  };
  const mailer: Mailer = options.mailer ?? {
    send: async (_message: EmailMessage) => undefined,
  };
  return new SessionPolicy(
    prisma as unknown as PrismaService,
    fakeOperatingSettings({ staffPasskeysRequired: options.required ?? false }),
    mailer,
    TENANT,
  );
}
