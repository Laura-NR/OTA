import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { ReminderScanResultDto } from '@ota/schemas';

import { Roles } from '../common/auth/roles.decorator';
import { PAYMENT_WRITE_ROLES } from './payment-roles';
import { RemindersService } from './reminders.service';

/**
 * Phase 6: run the reminder scans on demand; the daily balance job and the
 * 15-minute window job run them too.
 */
@Controller('payments/reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  scan(): Promise<ReminderScanResultDto> {
    return this.reminders.scan();
  }

  @Post('window-scan')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  scanWindows(): Promise<ReminderScanResultDto> {
    return this.reminders.scanWindows();
  }
}
