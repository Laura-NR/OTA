import { dirname, join } from 'node:path';

import { Module } from '@nestjs/common';
import { loadTenantMessages, type TenantConfig } from '@ota/config';
import { legalContentSchema, type LegalContent } from '@ota/schemas';

import { resolveTenantConfigPath } from '../tenant/tenant.path';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { AffidavitsService } from './affidavits.service';
import { ComplianceController } from './compliance.controller';
import { LEGAL_CONTENT } from './compliance.tokens';
import { ConsentsService } from './consents.service';
import { LegalTextsService } from './legal-texts.service';
import { MeComplianceController } from './me-compliance.controller';
import { OfacRemindersService } from './ofac-reminders.service';

/** Each locale's `content.legal` from the tenant messages; a locale without one is absent. */
function loadLegalContent(tenant: TenantConfig): Record<string, LegalContent> {
  const directory = join(dirname(resolveTenantConfigPath()), 'messages');
  const content: Record<string, LegalContent> = {};
  for (const locale of new Set([...tenant.supportedLocales, 'en'])) {
    const messages = loadTenantMessages(join(directory, `${locale}.json`));
    const legal = (messages.content as { legal?: unknown } | undefined)?.legal;
    if (legal !== undefined) {
      // A malformed block fails startup, like the manifest.
      content[locale] = legalContentSchema.parse(legal);
    }
  }
  return content;
}

@Module({
  controllers: [ComplianceController, MeComplianceController],
  providers: [
    AffidavitsService,
    ConsentsService,
    LegalTextsService,
    OfacRemindersService,
    {
      provide: LEGAL_CONTENT,
      inject: [TENANT_CONFIG],
      useFactory: loadLegalContent,
    },
  ],
  // The Booking form (MeModule) signs and records consents as it books.
  exports: [AffidavitsService, ConsentsService],
})
export class ComplianceModule {}
