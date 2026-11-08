import type { Prisma } from '@ota/db';
import {
  normalizeEmails,
  superAdminBootstrapRefusals,
  UserRole,
  type SuperAdminBootstrapRefusal,
} from '@ota/domain';

export const SUPER_ADMIN_BOOTSTRAP_ACTION = 'staff.super_admin_bootstrapped';

export type SuperAdminBootstrapResult =
  | { ok: true; promoted: { id: string; email: string; from: string }[] }
  | { ok: false; refusals: SuperAdminBootstrapRefusal[] };

/**
 * Promote the first Super Admins (`docs/deployment-plan.md` B9, D22). There is
 * no actor yet, so each promotion is audited with a null actor. Run it inside a
 * serializable transaction so two runs cannot both see no Super Admin.
 */
export async function bootstrapSuperAdmins(
  tx: Prisma.TransactionClient,
  emails: readonly string[],
  allowedDomains: readonly string[],
): Promise<SuperAdminBootstrapResult> {
  const wanted = normalizeEmails(emails);
  const superAdminCount = await tx.user.count({ where: { role: UserRole.SuperAdmin } });
  const users =
    wanted.length === 0
      ? []
      : await tx.user.findMany({
          where: { email: { in: wanted, mode: 'insensitive' } },
          select: {
            id: true,
            email: true,
            role: true,
            deactivatedAt: true,
            _count: { select: { reservations: true } },
            supplierProfile: { select: { id: true } },
          },
        });
  const refusals = superAdminBootstrapRefusals({
    emails: wanted,
    superAdminCount,
    allowedDomains,
    candidates: users.map((user) => ({
      email: user.email,
      role: user.role,
      deactivatedAt: user.deactivatedAt,
      reservationCount: user._count.reservations,
      hasSupplierProfile: user.supplierProfile !== null,
    })),
  });
  if (refusals.length > 0) return { ok: false, refusals };

  const promoted: { id: string; email: string; from: string }[] = [];
  for (const user of users) {
    await tx.user.update({ where: { id: user.id }, data: { role: UserRole.SuperAdmin } });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: SUPER_ADMIN_BOOTSTRAP_ACTION,
        entityType: 'User',
        entityId: user.id,
        metadata: { from: user.role, to: UserRole.SuperAdmin, via: 'bootstrap-command' },
      },
    });
    promoted.push({ id: user.id, email: user.email, from: user.role });
  }
  return { ok: true, promoted };
}
