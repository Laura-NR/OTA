import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_PASSKEY_KEY = 'ota:allow-without-passkey';

/**
 * Let a session that the staff passkey rule holds back (no passkey yet, or a
 * link sign-in by someone who has one) reach this handler, so the setup page
 * can load (`docs/schema-m9-passkeys.md` P3). The account and session-limit
 * refusals still apply. Only for routes about the caller's own account.
 */
export const AllowWithoutPasskey = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_WITHOUT_PASSKEY_KEY, true);
