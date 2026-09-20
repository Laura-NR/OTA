import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ReservationsModule } from './reservations/reservations.module';

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
    PrismaModule,
    ReservationsModule,
  ],
  controllers: [HealthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
