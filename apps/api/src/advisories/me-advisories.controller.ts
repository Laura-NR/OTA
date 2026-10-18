import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type {
  AdvisoryAcknowledgementDto,
  AdvisoryAcknowledgementsDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AdvisoriesService } from './advisories.service';

/**
 * The signed-in visitor's critical-advisory acknowledgements (M7 D8): any
 * authenticated role, always the caller's own.
 */
@Controller('me/advisories')
export class MeAdvisoriesController {
  constructor(private readonly advisories: AdvisoriesService) {}

  @Get('acknowledgements')
  acknowledgements(@CurrentUser() actor: AuthUser): Promise<AdvisoryAcknowledgementsDto> {
    return this.advisories.acknowledgements(actor);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryAcknowledgementDto> {
    return this.advisories.acknowledge(actor, id);
  }
}
