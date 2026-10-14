import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  paymentLedgerQuerySchema,
  type PaymentLedgerEntryDto,
  type PaymentLedgerQuery,
} from '@ota/schemas';

import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PaymentsService } from './payments.service';

/** The operations payment ledger (A-Payments, read-only until refunds and proofs land with M4). */
@Controller('payments')
export class PaymentsLedgerController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles(UserRole.OperationsAdmin, UserRole.AdministrativeSupport, UserRole.SuperAdmin)
  list(
    @Query(new ZodValidationPipe(paymentLedgerQuerySchema)) query: PaymentLedgerQuery,
  ): Promise<PaymentLedgerEntryDto[]> {
    return this.payments.ledger(query);
  }
}
