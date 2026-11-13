import { Body, Controller, Get, Put } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  setDisplayCurrencySchema,
  type CurrencySettingsDto,
  type PublicCurrenciesDto,
  type SetDisplayCurrencyRequest,
} from '@ota/schemas';

import { Public } from '../auth/public.decorator';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CurrenciesService } from './currencies.service';

const STAFF_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/**
 * M9 display currencies (`docs/schema-m9-display-currencies.md` C4, C5, C7).
 * The rates shown are public (the storefront converts with them); the desk
 * reads A-Settings' table; anyone signed in keeps their own choice.
 */
@Controller()
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get('catalog/currencies')
  @Public()
  publicCurrencies(): Promise<PublicCurrenciesDto> {
    return this.currencies.publicCurrencies();
  }

  @Get('settings/currencies')
  @Roles(...STAFF_ROLES)
  settings(): Promise<CurrencySettingsDto> {
    return this.currencies.settingsView();
  }

  @Put('me/display-currency')
  setPreference(
    @Body(new ZodValidationPipe(setDisplayCurrencySchema))
    body: SetDisplayCurrencyRequest,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.currencies.setPreference(actor, body.currency);
  }
}
