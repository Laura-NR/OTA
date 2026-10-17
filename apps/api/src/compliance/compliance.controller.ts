import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  affidavitExportQuerySchema,
  recordPaperAffidavitSchema,
  type AffidavitExportQuery,
  type AffidavitRecordDto,
  type AffidavitSummaryDto,
  type ConsentRecordDto,
  type RecordPaperAffidavitRequest,
  type ReservationOfacDto,
} from '@ota/schemas';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AffidavitsService } from './affidavits.service';
import { ConsentsService } from './consents.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/**
 * M3 on the desk: each booking's OFAC position, paper affidavits, the audited
 * full record and scan, the Super Admin's legal export, and a customer's
 * consent log. Support staff see statuses, never a signature or an IP.
 */
@Controller()
export class ComplianceController {
  constructor(
    private readonly affidavits: AffidavitsService,
    private readonly consents: ConsentsService,
  ) {}

  @Get('reservations/:id/ofac')
  @Roles(...READ_ROLES)
  status(@Param('id', ParseUUIDPipe) id: string): Promise<ReservationOfacDto> {
    return this.affidavits.status(id);
  }

  @Post('reservations/:id/travelers/:travelerId/affidavit')
  @Roles(...WRITE_ROLES)
  recordPaper(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('travelerId', ParseUUIDPipe) travelerId: string,
    @Body(new ZodValidationPipe(recordPaperAffidavitSchema))
    body: RecordPaperAffidavitRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<AffidavitSummaryDto> {
    return this.affidavits.recordPaper(actor, id, travelerId, body);
  }

  /** Declared before `affidavits/:id` so "export" is never read as an id. */
  @Get('affidavits/export')
  @Roles(UserRole.SuperAdmin)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ofac-affidavits.csv"')
  @Header('Cache-Control', 'no-store')
  export(
    @Query(new ZodValidationPipe(affidavitExportQuerySchema)) query: AffidavitExportQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<string> {
    return this.affidavits.export(query, actor);
  }

  @Get('affidavits/:id')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  record(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<AffidavitRecordDto> {
    return this.affidavits.record(id, actor);
  }

  @Get('affidavits/:id/document')
  @Roles(...WRITE_ROLES)
  async document(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.affidavits.document(id, actor);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'no-store');
    response.send(Buffer.from(data));
  }

  @Get('customers/:id/consents')
  @Roles(...READ_ROLES)
  customerConsents(@Param('id', ParseUUIDPipe) id: string): Promise<ConsentRecordDto[]> {
    return this.consents.forCustomer(id);
  }
}
