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
  createSupplierApplicationSchema,
  listSupplierApplicationsQuerySchema,
  reviewSupplierApplicationSchema,
  type CreateSupplierApplicationRequest,
  type ListSupplierApplicationsQuery,
  type ReviewSupplierApplicationRequest,
  type SupplierApplicationDto,
} from '@ota/schemas';

import { Public } from '../auth/public.decorator';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { SupplierApplicationsService } from './supplier-applications.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

@Controller('supplier-applications')
export class SupplierApplicationsController {
  constructor(private readonly applications: SupplierApplicationsService) {}

  @Post()
  @Public()
  submit(
    @Body(new ZodValidationPipe(createSupplierApplicationSchema))
    body: CreateSupplierApplicationRequest,
  ): Promise<SupplierApplicationDto> {
    return this.applications.submit(body);
  }

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(listSupplierApplicationsQuerySchema))
    query: ListSupplierApplicationsQuery,
  ): Promise<SupplierApplicationDto[]> {
    return this.applications.list(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierApplicationDto> {
    return this.applications.approve(id, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewSupplierApplicationSchema))
    body: ReviewSupplierApplicationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<SupplierApplicationDto> {
    return this.applications.reject(id, body, actor);
  }
}
