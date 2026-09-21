import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  commitImportSchema,
  importUploadSchema,
  type CommitImportRequest,
  type ImportBatchDto,
  type ImportCommitResultDto,
  type ImportPreviewDto,
  type ImportUploadRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ImportsService } from './imports.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  preview(
    @Body(new ZodValidationPipe(importUploadSchema)) body: ImportUploadRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ImportPreviewDto> {
    return this.imports.preview(body.filename, body.contentBase64, actor);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ImportBatchDto> {
    return this.imports.get(id);
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  commit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(commitImportSchema)) body: CommitImportRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ImportCommitResultDto> {
    return this.imports.commit(id, body, actor);
  }
}
