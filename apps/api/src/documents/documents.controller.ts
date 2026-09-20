import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import type { DocumentDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DocumentsService } from './documents.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

@Controller('reservations/:id/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentDto[]> {
    return this.documents.list(id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<DocumentDto[]> {
    return this.documents.generate(id, actor);
  }
}
