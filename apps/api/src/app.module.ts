import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SuppliersModule } from './suppliers/suppliers.module';

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
    PrismaModule,
    ReservationsModule,
    SuppliersModule,
    DispatchModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
