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
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  createPackageSchema,
  listPackagesQuerySchema,
  packageMediaUploadSchema,
  putPackageTranslationSchema,
  updatePackageSchema,
  type CreatePackageRequest,
  type ListPackagesQuery,
  type PackageDto,
  type PackageMediaDto,
  type PackageMediaUploadRequest,
  type PutPackageTranslationRequest,
  type UpdatePackageRequest,
} from '@ota/schemas';
import type { Response } from 'express';

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

  // Package media is served through an authorised route; the public stream
  // lives at GET /catalog/packages/media/:id.
  @Get('media/:mediaId')
  @Roles(...READ_ROLES)
  async media(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.packages.readMedia(mediaId, false);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'private, max-age=60');
    response.send(Buffer.from(data));
  }

  @Post(':id/media')
  @Roles(...WRITE_ROLES)
  addMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(packageMediaUploadSchema))
    body: PackageMediaUploadRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PackageMediaDto> {
    return this.packages.uploadMedia(id, body, actor);
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  deleteMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.packages.deleteMedia(id, mediaId, actor);
  }

  @Put(':id/translations/:locale')
  @Roles(...WRITE_ROLES)
  saveTranslation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locale') locale: string,
    @Body(new ZodValidationPipe(putPackageTranslationSchema))
    body: PutPackageTranslationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PackageDto> {
    return this.packages.upsertTranslation(id, locale, body, actor);
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
