import { Module } from '@nestjs/common';
import { createPaymentProviders, type PaymentProviderName } from '@ota/payments';

import { ReservationsModule } from '../reservations/reservations.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDERS } from './payments.tokens';

/**
 * Payment intents and confirmation. Concrete gateways are injected behind the
 * `PAYMENT_PROVIDERS` map so a rail can be swapped without touching consumers
 * (ADR 0003). Wire transfer is the primary rail; the card rail stays on the
 * mock until a signed card gateway is wired.
 */
@Module({
  imports: [ReservationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: () =>
        createPaymentProviders({
          checkoutBaseUrl: process.env.PAYMENT_CHECKOUT_BASE_URL,
          cardProvider: process.env.PAYMENT_PROVIDER_CARD as
            PaymentProviderName | undefined,
          bankTransferProvider: process.env.PAYMENT_PROVIDER_BANK_TRANSFER as
            PaymentProviderName | undefined,
        }),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
