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
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  listSuppliersQuerySchema,
  setVerificationSchema,
  type ListSuppliersQuery,
  type SetVerificationRequest,
  type SupplierDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @Roles(UserRole.OperationsAdmin, UserRole.AdministrativeSupport, UserRole.SuperAdmin)
  list(
    @Query(new ZodValidationPipe(listSuppliersQuerySchema))
    query: ListSuppliersQuery,
  ): Promise<SupplierDto[]> {
    return this.suppliers.list(query);
  }

  @Get(':id')
  @Roles(UserRole.OperationsAdmin, UserRole.AdministrativeSupport, UserRole.SuperAdmin)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierDto> {
    return this.suppliers.getById(id);
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
}
