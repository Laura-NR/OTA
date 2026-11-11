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
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  declareWorkerFuelSchema,
  setWorkerDaysSchema,
  workerCalendarQuerySchema,
  type DeclareWorkerFuelRequest,
  type SetWorkerDaysRequest,
  type WorkerCalendarDto,
  type WorkerCalendarQuery,
  type WorkerDaysResultDto,
  type WorkerEarningsDto,
  type WorkerFuelDto,
  type WorkerHomeDto,
  type WorkerSignInCodeDto,
  type WorkerSignOutDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { WorkerCodesService } from './worker-codes.service';
import { WorkerService } from './worker.service';

/** The worker app's own routes (`docs/worker-app-plan.md` W5). */
@Controller('worker')
export class WorkerController {
  constructor(private readonly worker: WorkerService) {}

  @Get('home')
  @Roles(UserRole.ServiceWorker)
  home(@CurrentUser() actor: AuthUser): Promise<WorkerHomeDto> {
    return this.worker.home(actor);
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ServiceWorker)
  async signOut(@CurrentUser() actor: AuthUser): Promise<void> {
    await this.worker.signOut(actor);
  }

  /** W-Calendar: one month of the worker's own days. */
  @Get('calendar')
  @Roles(UserRole.ServiceWorker)
  calendar(
    @Query(new ZodValidationPipe(workerCalendarQuerySchema)) query: WorkerCalendarQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<WorkerCalendarDto> {
    return this.worker.calendar(actor, query);
  }

  /** Block or free a day or a range of the worker's own calendar. */
  @Put('availability')
  @Roles(UserRole.ServiceWorker)
  setDays(
    @Body(new ZodValidationPipe(setWorkerDaysSchema)) body: SetWorkerDaysRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<WorkerDaysResultDto> {
    return this.worker.setDays(actor, body);
  }

  /** W-Earnings: reliability, payouts and the latest finished jobs, read-only. */
  @Get('earnings')
  @Roles(UserRole.ServiceWorker)
  earnings(@CurrentUser() actor: AuthUser): Promise<WorkerEarningsDto> {
    return this.worker.earnings(actor);
  }

  /** A driver's weekly fuel declaration. */
  @Put('fuel')
  @Roles(UserRole.ServiceWorker)
  declareFuel(
    @Body(new ZodValidationPipe(declareWorkerFuelSchema)) body: DeclareWorkerFuelRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<WorkerFuelDto> {
    return this.worker.declareFuel(actor, body);
  }
}

/**
 * The desk's worker app actions on a supplier: "Issue sign-in code" (W1), a
 * code an operator reads out to a worker after checking their ID card, and
 * "Sign out of the worker app", for a lost phone. Not tied to the
 * `suppliers` capability, so no permission override reaches them.
 */
@Controller('suppliers')
export class WorkerSignInCodeController {
  constructor(private readonly codes: WorkerCodesService) {}

  @Post(':id/sign-in-code')
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  issue(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<WorkerSignInCodeDto> {
    return this.codes.issue(id, actor);
  }

  @Post(':id/worker-sign-out')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  signOut(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<WorkerSignOutDto> {
    return this.codes.signOut(id, actor);
  }
}
