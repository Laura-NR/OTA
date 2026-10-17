import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  bookPackageSchema,
  createMyReservationSchema,
  createPackageBookingSchema,
  createPaymentIntentSchema,
  createReviewSchema,
  proofUploadSchema,
  type BookPackageRequest,
  type CreateMyReservationRequest,
  type CreatePackageBookingRequest,
  type CreatePaymentIntentRequest,
  type CreateReviewRequest,
  type MeProfileDto,
  type MyReservationDetailDto,
  type MyReservationListItemDto,
  type MyReviewDto,
  type PaymentIntentDto,
  type PaymentScheduleDto,
  type ProofSummaryDto,
  type ProofUploadRequest,
} from '@ota/schemas';
import type { Request } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ProofsService } from '../payments/proofs.service';
import { ScheduleService } from '../payments/schedule.service';
import { MeService } from './me.service';

/**
 * Self-service endpoints for the signed-in user. Any authenticated role may
 * read its own profile and bookings; the service scopes every query by user id.
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly schedule: ScheduleService,
    private readonly proofs: ProofsService,
  ) {}

  @Get()
  profile(@CurrentUser() actor: AuthUser): Promise<MeProfileDto> {
    return this.me.getProfile(actor.id);
  }

  @Get('reservations')
  reservations(@CurrentUser() actor: AuthUser): Promise<MyReservationListItemDto[]> {
    return this.me.listReservations(actor.id);
  }

  @Post('reservations')
  @HttpCode(HttpStatus.CREATED)
  createReservation(
    @Body(new ZodValidationPipe(createMyReservationSchema))
    body: CreateMyReservationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyReservationDetailDto> {
    return this.me.createReservation(actor.id, body);
  }

  @Post('reservations/from-package')
  @HttpCode(HttpStatus.CREATED)
  bookPackage(
    @Body(new ZodValidationPipe(createPackageBookingSchema))
    body: CreatePackageBookingRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyReservationDetailDto> {
    return this.me.createPackageReservation(actor.id, body);
  }

  /**
   * The Booking form: departure, tier, party, rooms, extras, US certifications
   * and consents in one request. The request's IP and browser are kept with
   * each online certification (M3, D5).
   */
  @Post('reservations/package-booking')
  @HttpCode(HttpStatus.CREATED)
  bookPackageWithParty(
    @Body(new ZodValidationPipe(bookPackageSchema)) body: BookPackageRequest,
    @CurrentUser() actor: AuthUser,
    @Req() request: Request,
  ): Promise<MyReservationDetailDto> {
    const userAgent = request.headers['user-agent'];
    return this.me.bookPackage(actor, body, {
      ipAddress: request.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    });
  }

  @Post('reservations/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  createPaymentLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPaymentIntentSchema))
    body: CreatePaymentIntentRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentIntentDto> {
    return this.me.createPaymentLink(actor, id, body);
  }

  /** M4: the caller's payment schedule, receipts, proofs and refunds. */
  @Get('reservations/:id/schedule')
  paymentSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentScheduleDto> {
    return this.schedule.get(id, { ownerId: actor.id });
  }

  /** M4 D5: a proof of transfer for the caller's own pending bank transfer. */
  @Post('reservations/:id/payments/:paymentId/proof')
  @HttpCode(HttpStatus.CREATED)
  uploadProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body(new ZodValidationPipe(proofUploadSchema)) body: ProofUploadRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProofSummaryDto> {
    return this.proofs.upload(actor, id, paymentId, body);
  }

  @Post('reservations/:id/reviews')
  @HttpCode(HttpStatus.CREATED)
  createReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyReviewDto> {
    return this.me.createReview(actor.id, id, body);
  }

  @Get('reservations/:id')
  reservation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyReservationDetailDto> {
    return this.me.getReservation(actor.id, id);
  }
}
