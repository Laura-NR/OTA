import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CREDENTIAL_EXPIRY_WINDOW_DAYS } from '@ota/domain';

import { COMPLIANCE_SCHEDULER, type ComplianceScheduler } from './expiry-alert.scheduler';
import { SuppliersService } from './suppliers.service';

/**
 * Recurring credential-expiry scan (spec §4.5). Auto-dispatch already pauses
 * workers inside the 30-day window (domain `canAutoDispatch`); this flags them
 * for the operations desk.
 */
@Injectable()
export class ExpiryAlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryAlertService.name);

  constructor(
    private readonly suppliers: SuppliersService,
    @Inject(COMPLIANCE_SCHEDULER) private readonly scheduler: ComplianceScheduler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.schedule(() => this.scan());
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.close();
  }

  async scan(): Promise<void> {
    const expiring = await this.suppliers.listExpiring({
      days: CREDENTIAL_EXPIRY_WINDOW_DAYS,
    });
    if (expiring.length > 0) {
      this.logger.warn(
        `${expiring.length} supplier credential(s) expiring within ` +
          `${CREDENTIAL_EXPIRY_WINDOW_DAYS} days (auto-dispatch paused): ` +
          expiring.map((supplier) => supplier.email).join(', '),
      );
    }
  }
}
