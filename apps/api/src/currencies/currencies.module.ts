import { Module } from '@nestjs/common';

import { BullmqFxRateScheduler } from './bullmq-fx-rate.scheduler';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { createFxRateProvider } from './fx-rate.provider';
import { NoopFxRateScheduler } from './fx-rate.scheduler';
import { FX_RATE_PROVIDER, FX_RATE_SCHEDULER } from './fx-rate.tokens';

/**
 * M9 display currencies. The rate provider is the mock unless
 * `FX_RATE_PROVIDER=ecb`; the daily refresh is a no-op in tests or without
 * Redis, matching the other scheduled jobs.
 */
@Module({
  controllers: [CurrenciesController],
  providers: [
    CurrenciesService,
    { provide: FX_RATE_PROVIDER, useFactory: () => createFxRateProvider() },
    {
      provide: FX_RATE_SCHEDULER,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (process.env.NODE_ENV === 'test' || !redisUrl) {
          return new NoopFxRateScheduler();
        }
        return new BullmqFxRateScheduler(redisUrl);
      },
    },
  ],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
