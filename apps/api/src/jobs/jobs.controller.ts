import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  recordJobStepSchema,
  serviceItemBriefSchema,
  type JobBriefDto,
  type JobStepTimesDto,
  type RecordJobStepRequest,
  type ServiceItemBriefRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { Capability } from '../common/auth/capability.decorator';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { JobsService } from './jobs.service';

/** The desk's side of W-Job: the brief for the worker and a step after a call. */
@Capability('bookings')
@Controller('service-items')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Patch(':id/brief')
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  updateBrief(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(serviceItemBriefSchema)) body: ServiceItemBriefRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<JobBriefDto> {
    return this.jobs.updateBrief(actor, id, body);
  }

  @Post(':id/steps')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  recordStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordJobStepSchema)) body: RecordJobStepRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<JobStepTimesDto> {
    return this.jobs.deskStep(actor, id, body);
  }
}
