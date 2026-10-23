import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { COMPLIANCE_SCHEDULER, type ComplianceScheduler } from './expiry-alert.scheduler';
import { SuppliersService } from './suppliers.service';

/**
 * Recurring credential-expiry scan (spec §4.5). Auto-dispatch already pauses
 * workers inside the expiry window (30 days unless M9 settings change it;
 * domain `canAutoDispatch`); this flags them for the operations desk.
 */
@Injectable()
export class ExpiryAlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryAlertService.name);

  constructor(
    private readonly suppliers: SuppliersService,
    @Inject(COMPLIANCE_SCHEDULER) private readonly scheduler: ComplianceScheduler,
    private readonly settings: OperatingSettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.schedule(() => this.scan());
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.close();
  }

  async scan(): Promise<void> {
    const days = (await this.settings.thresholds()).credentialExpiryWindowDays;
    const expiring = await this.suppliers.listExpiring({ days });
    if (expiring.length > 0) {
      this.logger.warn(
        `${expiring.length} supplier credential(s) expiring within ` +
          `${days} days (auto-dispatch paused): ` +
          expiring.map((supplier) => supplier.email).join(', '),
      );
    }
  }
}
