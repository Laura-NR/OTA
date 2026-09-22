import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  expiringSuppliersQuerySchema,
  listSuppliersQuerySchema,
  setVerificationSchema,
  uploadCredentialSchema,
  type ExpiringSuppliersQuery,
  type ListSuppliersQuery,
  type SetVerificationRequest,
  type SupplierDto,
  type UploadCredentialRequest,
} from '@ota/schemas';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { SuppliersService } from './suppliers.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(listSuppliersQuerySchema))
    query: ListSuppliersQuery,
  ): Promise<SupplierDto[]> {
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
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierDto> {
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
