import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AnalyticsModule } from './analytics/analytics.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { DocumentsModule } from './documents/documents.module';
import { EmailModule } from './email/email.module';
import { HealthController } from './health.controller';
import { ImportsModule } from './imports/imports.module';
import { InventoryModule } from './inventory/inventory.module';
import { MeModule } from './me/me.module';
import { MessagesModule } from './messages/messages.module';
import { PackagesModule } from './packages/packages.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegulatoryModule } from './regulatory/regulatory.module';
import { ReservationsModule } from './reservations/reservations.module';
import { StorageModule } from './storage/storage.module';
import { SupplierApplicationsModule } from './supplier-applications/supplier-applications.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TenantModule } from './tenant/tenant.module';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: isTest ? 'silent' : 'info',
        transport:
          isProduction || isTest
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
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
    PackagesModule,
    MeModule,
    SupplierApplicationsModule,
    AnalyticsModule,
    RegulatoryModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
