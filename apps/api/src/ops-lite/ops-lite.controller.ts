import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import type { OpsLiteInboxDto, OpsLitePipelineDto } from '@ota/schemas';

import { Capability } from '../common/auth/capability.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { OpsLiteService } from './ops-lite.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/**
 * Ops Lite's reads for the desk's phone screens (Phase 7 item 2). The alerts
 * screen reads the desk's own routes; the pipeline and the inbox need a
 * summary across bookings, which these give.
 */
@Controller('ops-lite')
export class OpsLiteController {
  constructor(private readonly opsLite: OpsLiteService) {}

  @Get('pipeline')
  @Capability('bookings')
  @Roles(...READ_ROLES)
  pipeline(): Promise<OpsLitePipelineDto> {
    return this.opsLite.pipeline();
  }

  @Get('inbox')
  @Roles(...READ_ROLES)
  inbox(): Promise<OpsLiteInboxDto> {
    return this.opsLite.inbox();
  }
}
