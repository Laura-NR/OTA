import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  legalLocaleQuerySchema,
  recordConsentSchema,
  signAffidavitSchema,
  type AffidavitSummaryDto,
  type ConsentRecordDto,
  type LegalLocaleQuery,
  type MyConsentDto,
  type RecordConsentRequest,
  type ReservationOfacDto,
  type SignAffidavitRequest,
} from '@ota/schemas';
import type { Request } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AffidavitsService } from './affidavits.service';
import { ConsentsService } from './consents.service';

/**
 * M3 for the signed-in traveler: the OFAC position of their own booking, the
 * online certification (the request's IP and browser are kept with it, D5),
 * and their consents. Every query is scoped to the caller.
 */
@Controller('me')
export class MeComplianceController {
  constructor(
    private readonly affidavits: AffidavitsService,
    private readonly consents: ConsentsService,
  ) {}

  @Get('reservations/:id/ofac')
  ofac(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(legalLocaleQuerySchema)) query: LegalLocaleQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<ReservationOfacDto> {
    return this.affidavits.status(id, { ownerId: actor.id, locale: query.locale });
  }

  @Post('reservations/:id/travelers/:travelerId/affidavit')
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('travelerId', ParseUUIDPipe) travelerId: string,
    @Body(new ZodValidationPipe(signAffidavitSchema)) body: SignAffidavitRequest,
    @CurrentUser() actor: AuthUser,
    @Req() request: Request,
  ): Promise<AffidavitSummaryDto> {
    const userAgent = request.headers['user-agent'];
    return this.affidavits.sign(actor, id, travelerId, body, {
      ipAddress: request.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    });
  }

  @Get('consents')
  myConsents(
    @Query(new ZodValidationPipe(legalLocaleQuerySchema)) query: LegalLocaleQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyConsentDto[]> {
    return this.consents.mine(actor.id, query.locale);
  }

  @Post('consents')
  recordConsent(
    @Body(new ZodValidationPipe(recordConsentSchema)) body: RecordConsentRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ConsentRecordDto> {
    return this.consents.record(actor.id, body);
  }
}
