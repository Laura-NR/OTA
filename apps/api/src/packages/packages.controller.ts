import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  createPackageSchema,
  listPackagesQuerySchema,
  updatePackageSchema,
  type CreatePackageRequest,
  type ListPackagesQuery,
  type PackageDto,
  type UpdatePackageRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PackagesService } from './packages.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/** Curated-package CMS (spec §3.3, §4.6). */
@Controller('packages')
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(listPackagesQuerySchema))
    query: ListPackagesQuery,
  ): Promise<PackageDto[]> {
    return this.packages.list(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PackageDto> {
    return this.packages.getById(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @Body(new ZodValidationPipe(createPackageSchema)) body: CreatePackageRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PackageDto> {
    return this.packages.create(body, actor);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePackageSchema)) body: UpdatePackageRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PackageDto> {
    return this.packages.update(id, body, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.packages.remove(id, actor);
  }
}
