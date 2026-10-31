import { Controller, Get, Inject } from '@nestjs/common';
import type { TenantConfig } from '@ota/config';

import { Public } from '../auth/public.decorator';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from './tenant.tokens';

export interface PublicTenantConfig {
  tenantId: string;
  branding: TenantConfig['branding'];
  primaryLocale: string;
  supportedLocales: string[];
  theme: TenantConfig['theme'];
  features: TenantConfig['features'];
  destinations: TenantConfig['destinations'];
}

/**
 * The public agency manifest consumed by the web/mobile clients to brand
 * themselves and toggle modules. Contains no secrets. The features are the
 * flags in force: the manifest's, or an applied settings version's (M9 D8b).
 */
@Controller('tenant')
export class TenantController {
  constructor(
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    private readonly settings: OperatingSettingsService,
  ) {}

  @Get('config')
  @Public()
  async config(): Promise<PublicTenantConfig> {
    return {
      tenantId: this.tenant.tenantId,
      branding: this.tenant.branding,
      primaryLocale: this.tenant.primaryLocale,
      supportedLocales: this.tenant.supportedLocales,
      theme: this.tenant.theme,
      features: await this.settings.features(),
      destinations: this.tenant.destinations,
    };
  }
}
