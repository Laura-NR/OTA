import { Module } from '@nestjs/common';
import { createPaymentProviders, type PaymentProviderName } from '@ota/payments';

import { ReservationsModule } from '../reservations/reservations.module';
import { PaymentsLedgerController } from './payments-ledger.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDERS } from './payments.tokens';
import { ProofsController } from './proofs.controller';
import { ProofsService } from './proofs.service';
import { PublicPaymentController } from './public-payment.controller';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

/**
 * Payment intents and confirmation, and the M4 schedule, proofs of transfer
 * and refunds. Concrete gateways are injected behind the
 * `PAYMENT_PROVIDERS` map so a rail can be swapped without touching consumers
 * (ADR 0003). Wire transfer is the primary rail; the card rail stays on the
 * mock until a signed card gateway is wired.
 */
@Module({
  imports: [ReservationsModule],
  controllers: [
    PaymentsController,
    PaymentsLedgerController,
    PublicPaymentController,
    ScheduleController,
    ProofsController,
    RefundsController,
  ],
  providers: [
    PaymentsService,
    ScheduleService,
    ProofsService,
    RefundsService,
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
  exports: [PaymentsService, ScheduleService, ProofsService],
})
export class PaymentsModule {}
