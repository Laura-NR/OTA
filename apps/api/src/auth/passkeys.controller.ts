import { Controller, Get } from '@nestjs/common';
import type { PasskeyStatusDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AllowWithoutPasskey } from './allow-without-passkey.decorator';
import { SessionPolicy } from './session-policy';

/**
 * The signed-in person's passkeys and where the staff rule leaves this
 * session (`docs/schema-m9-passkeys.md` P3, P4). Adding, renaming and
 * deleting go through Better Auth's passkey routes, which ask `SessionPolicy`.
 */
@Controller('me/passkeys')
export class PasskeysController {
  constructor(private readonly policy: SessionPolicy) {}

  @Get()
  @AllowWithoutPasskey()
  status(@CurrentUser() actor: AuthUser): Promise<PasskeyStatusDto> {
    return this.policy.status(actor);
  }
}
