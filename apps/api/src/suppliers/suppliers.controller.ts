import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  availabilityQuerySchema,
  confirmResourcesSchema,
  expiringSuppliersQuerySchema,
  listSuppliersQuerySchema,
  recordSupplierPayoutSchema,
  setAvailabilitySchema,
  setPayoutMethodSchema,
  setVerificationSchema,
  uploadCredentialSchema,
  vehicleDetailsInputSchema,
  type AvailabilityDayDto,
  type AvailabilityQuery,
  type ConfirmResourcesRequest,
  type ExpiringSuppliersQuery,
  type ListSuppliersQuery,
  type RecordSupplierPayoutRequest,
  type SetAvailabilityRequest,
  type SetPayoutMethodRequest,
  type SetVerificationRequest,
  type SupplierDetailDto,
  type SupplierDto,
  type SupplierPayoutLedgerDto,
  type SupplierRowDto,
  type UploadCredentialRequest,
  type VehicleDetailsRequest,
} from '@ota/schemas';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Capability } from '../common/auth/capability.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { sendPdf } from '../proposals/proposal-pdf';
import { SupplierPayoutsService } from './supplier-payouts.service';
import { SuppliersService } from './suppliers.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

@Capability('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly payouts: SupplierPayoutsService,
  ) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(listSuppliersQuerySchema))
    query: ListSuppliersQuery,
  ): Promise<SupplierRowDto[]> {
    return this.suppliers.list(query);
  }

  @Get('expiring')
  @Roles(...READ_ROLES)
  expiring(
    @Query(new ZodValidationPipe(expiringSuppliersQuerySchema))
    query: ExpiringSuppliersQuery,
  ): Promise<SupplierDto[]> {
    return this.suppliers.listExpiring(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierDetailDto> {
    return this.suppliers.getById(id);
  }

  @Get(':id/credential')
  @Roles(...READ_ROLES)
  async credential(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.suppliers.readCredential(id);
    response.setHeader('content-type', contentType);
    response.setHeader('content-disposition', 'inline');
    response.send(Buffer.from(data));
  }

  @Get(':id/availability')
  @Roles(...READ_ROLES)
  listAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery,
  ): Promise<AvailabilityDayDto[]> {
    return this.suppliers.listAvailability(id, query);
  }

  @Put(':id/availability')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  setAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setAvailabilitySchema)) body: SetAvailabilityRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<AvailabilityDayDto> {
    return this.suppliers.setAvailability(id, body, actor);
  }

  /** M6 D4: the desk confirms a casa's power or a driver's fuel; support reads only. */
  @Put(':id/resources')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  confirmResources(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmResourcesSchema)) body: ConfirmResourcesRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierDetailDto> {
    return this.suppliers.confirmResources(id, body, actor);
  }

  /** M6 D7(b): a driver's vehicle, written by the desk like the resources. */
  @Put(':id/vehicle')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  setVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vehicleDetailsInputSchema)) body: VehicleDetailsRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierDetailDto> {
    return this.suppliers.setVehicle(id, body, actor);
  }

  /** W-Earnings E2, E3: how the worker is paid; the app only shows it. */
  @Put(':id/payout-method')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  setPayoutMethod(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setPayoutMethodSchema)) body: SetPayoutMethodRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierDetailDto> {
    return this.suppliers.setPayoutMethod(id, body.method, actor);
  }

  /** W-Earnings: the finished jobs not yet paid and the payments made. */
  @Get(':id/payouts')
  @Roles(...READ_ROLES)
  payoutLedger(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierPayoutLedgerDto> {
    return this.payouts.ledger(id);
  }

  /** W-Earnings E1, E7: record a payment made to the worker. */
  @Post(':id/payouts')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  recordPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordSupplierPayoutSchema))
    body: RecordSupplierPayoutRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierPayoutLedgerDto> {
    return this.payouts.record(id, body, actor);
  }

  /** W-Earnings E5: a payment's receipt, printed for the worker to sign. */
  @Get(':id/payouts/:payoutId/receipt')
  @Roles(...READ_ROLES)
  async payoutReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { body, filename } = await this.payouts.receipt(payoutId, id);
    sendPdf(response, body, filename);
  }

  @Post(':id/verification')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  setVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setVerificationSchema)) body: SetVerificationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierDto> {
    return this.suppliers.setVerification(id, body, actor);
  }

  @Post(':id/credential')
  @HttpCode(HttpStatus.OK)
  @Roles(...READ_ROLES)
  uploadCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(uploadCredentialSchema)) body: UploadCredentialRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierDto> {
    return this.suppliers.uploadCredential(id, body, actor);
  }
}
