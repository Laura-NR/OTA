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
import type { WorkerHomeDto, WorkerSignInCodeDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
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
}

/**
 * The desk's "Issue sign-in code" (W1): a code an operator reads out to a
 * worker after checking their ID card. Not tied to the `suppliers`
 * capability, so no permission override reaches it.
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
}
