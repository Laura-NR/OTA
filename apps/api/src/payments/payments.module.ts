import { Module } from '@nestjs/common';
import { createPaymentProvider } from '@ota/payments';

import { ReservationsModule } from '../reservations/reservations.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './payments.tokens';

/**
 * Payment intents and confirmation. The concrete gateway is injected behind the
 * `PaymentProvider` token so the mock can be swapped for a real rail without
 * touching this module's consumers (ADR 0003).
 */
@Module({
  imports: [ReservationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () =>
        createPaymentProvider({
          provider: (process.env.PAYMENT_PROVIDER as 'mock' | undefined) ?? 'mock',
          checkoutBaseUrl: process.env.PAYMENT_CHECKOUT_BASE_URL,
        }),
    },
  ],
})
export class PaymentsModule {}
