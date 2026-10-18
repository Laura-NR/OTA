import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { BullmqReminderScheduler } from '../payments/bullmq-reminders.scheduler';
import { NoopReminderScheduler } from '../payments/reminders.scheduler';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_SCHEDULER } from './notifications.tokens';

/**
 * Phase 6 traveler notifications: E-Invoice and E-Confirmed on the booking's
 * transitions, and the daily review-request and reconfirmation scan.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATION_SCHEDULER,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (process.env.NODE_ENV === 'test' || !redisUrl) {
          return new NoopReminderScheduler();
        }
        return new BullmqReminderScheduler(redisUrl, {
          queueName: 'traveler-notifications',
          schedulerId: 'traveler-notification-scan',
          // Daily at 08:00, after the balance reminders (07:00).
          pattern: '0 8 * * *',
        });
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
