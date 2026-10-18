import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import type { NotificationScanResultDto } from '@ota/schemas';

import { Roles } from '../common/auth/roles.decorator';
import { NotificationsService } from './notifications.service';

/** Phase 6: run the daily traveler-notification scan on demand. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  scan(): Promise<NotificationScanResultDto> {
    return this.notifications.scan();
  }
}
