/**
 * One pass of the retention lifecycle, the same pass the daily 05:00 job runs
 * (notices, reminders, anonymization, sweeps). After a database restore, run it
 * before the apps start again, so travelers anonymized since the dump are
 * anonymized again (`docs/deployment-plan.md` D11, B11; runbook "Production").
 *   node dist/cli/retention-scan.js
 * It sends the notices that are due, as the job would.
 */
import { loadTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import { createMailer } from '@ota/email';

import type { PrismaService } from '../prisma/prisma.service';
import { NoopRetentionScheduler } from '../retention/retention.scheduler';
import { RetentionService } from '../retention/retention.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { objectStorageFromEnv } from '../storage/storage.module';
import { resolveTenantConfigPath } from '../tenant/tenant.path';

async function main(): Promise<void> {
  const tenant = loadTenantConfig(resolveTenantConfigPath());
  const prisma = new PrismaClient() as PrismaService;
  try {
    const service = new RetentionService(
      prisma,
      createMailer(),
      tenant,
      new NoopRetentionScheduler(),
      objectStorageFromEnv(),
      new OperatingSettingsService(prisma, tenant),
    );
    console.log(JSON.stringify(await service.scan()));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
