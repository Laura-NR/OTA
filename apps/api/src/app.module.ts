import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule, type Params } from 'nestjs-pino';

import { AdvisoriesModule } from './advisories/advisories.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AssistantModule } from './assistant/assistant.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { ComplianceModule } from './compliance/compliance.module';
import { ContactModule } from './contact/contact.module';
import { CustomersModule } from './customers/customers.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { DisruptionsModule } from './disruptions/disruptions.module';
import { DocumentsModule } from './documents/documents.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { InventoryModule } from './inventory/inventory.module';
import { MeModule } from './me/me.module';
import { MessagesModule } from './messages/messages.module';
import { PackagesModule } from './packages/packages.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProposalsModule } from './proposals/proposals.module';
import { QualityModule } from './quality/quality.module';
import { RegulatoryModule } from './regulatory/regulatory.module';
import { ReportsModule } from './reports/reports.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RetentionModule } from './retention/retention.module';
import { StorageModule } from './storage/storage.module';
import { SupplierApplicationsModule } from './supplier-applications/supplier-applications.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TenantModule } from './tenant/tenant.module';
import { TravelersModule } from './travelers/travelers.module';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * The request logger's options, exported so a test can log through them.
 * pino-http logs every request header and the response headers, so the
 * session cookie, a bearer token and the set-cookie that issues a session are
 * redacted before a line is written.
 */
export const httpLoggerOptions = {
  level: isTest ? 'silent' : 'info',
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
  ],
  transport:
    isProduction || isTest
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },
} satisfies Params['pinoHttp'];

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: httpLoggerOptions }),
    HealthModule,
    AuthModule,
    TenantModule,
    EmailModule,
    StorageModule,
    PrismaModule,
    ReservationsModule,
    SuppliersModule,
    DispatchModule,
    InventoryModule,
    DocumentsModule,
    MessagesModule,
    ImportsModule,
    PaymentsModule,
    ProposalsModule,
    PackagesModule,
    MeModule,
    SupplierApplicationsModule,
    AnalyticsModule,
    RegulatoryModule,
    AssistantModule,
    QualityModule,
    ReportsModule,
    RetentionModule,
    ContactModule,
    CustomersModule,
    TravelersModule,
    ComplianceModule,
    AdvisoriesModule,
    DisruptionsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
