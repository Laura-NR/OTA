/**
 * Promote the first Super Admins once, after they have each requested a
 * sign-in link on the desk (`docs/deployment-plan.md` B9, D22; runbook
 * "Production"). Refuses when any Super Admin exists.
 *   node dist/cli/bootstrap-super-admins.js founder@agency.example other@agency.example
 * Exit codes: 0 promoted, 1 refused or failed, 2 usage.
 */
import { loadTenantConfig } from '@ota/config';
import { Prisma, PrismaClient } from '@ota/db';
import type { SuperAdminBootstrapRefusal } from '@ota/domain';

import { bootstrapSuperAdmins } from '../staff/super-admin-bootstrap';
import { resolveTenantConfigPath } from '../tenant/tenant.path';

function describeRefusal(refusal: SuperAdminBootstrapRefusal): string {
  switch (refusal.code) {
    case 'NO_EMAILS':
      return 'Name at least one email address.';
    case 'SUPER_ADMIN_EXISTS':
      return 'A Super Admin already exists: invite staff from Settings › Users & roles.';
    case 'NOT_FOUND':
      return `${refusal.email}: no account; request a sign-in link on the desk first.`;
    case 'DOMAIN_NOT_ALLOWED':
      return `${refusal.email}: not in the tenant's staff email domains.`;
    case 'DEACTIVATED':
      return `${refusal.email}: the account is deactivated.`;
    case 'HAS_BOOKINGS_OR_SUPPLIER':
      return `${refusal.email}: the account has bookings or a supplier profile; staff use a separate address.`;
  }
}

async function main(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes('--help')) {
    console.error('Usage: node dist/cli/bootstrap-super-admins.js <email> [<email>...]');
    return 2;
  }
  const tenant = loadTenantConfig(resolveTenantConfigPath());
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(
      (tx) => bootstrapSuperAdmins(tx, args, tenant.staff.allowedEmailDomains),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!result.ok) {
      console.error('Refused; nobody was promoted.');
      for (const refusal of result.refusals) {
        console.error(`- ${describeRefusal(refusal)}`);
      }
      return 1;
    }
    for (const user of result.promoted) {
      console.log(`Promoted ${user.email} (${user.from} -> SUPER_ADMIN), audited.`);
    }
    if (result.promoted.length === 1) {
      console.log(
        'Two-person approvals need a second Super Admin: invite one from the desk.',
      );
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
