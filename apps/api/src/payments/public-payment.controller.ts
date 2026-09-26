import { Controller, Get, Param } from '@nestjs/common';
import type { PaymentIntentLookupDto } from '@ota/schemas';

import { Public } from '../auth/public.decorator';
import { PaymentsService } from './payments.service';

/**
 * Public, read-only payment lookups. The reference is an unguessable capability
 * token issued when the link is created, and the response carries no PII — it
 * only backs the wire-instructions page's authoritative amount/reference.
 */
@Controller('payments')
export class PublicPaymentController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('intents/:reference')
  @Public()
  lookup(@Param('reference') reference: string): Promise<PaymentIntentLookupDto> {
    return this.payments.lookupIntent(reference);
  }
}
