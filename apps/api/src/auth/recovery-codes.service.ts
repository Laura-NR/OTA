import { Injectable, Logger } from '@nestjs/common';
import {
  isStaffRole,
  normalizeRecoveryCode,
  recoveryFailureWithdraws,
} from '@ota/domain';
import { createHash, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { SessionPolicy } from './session-policy';

/** SHA-256 of a normalised code; only this is stored (R4). */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The API's side of a recovery sign-in (`docs/schema-m9-recovery-codes.md`):
 * Better Auth's `/sign-in/recovery-code` asks `redeem` whether an email and a
 * code sign someone in. Issuing and withdrawing codes is `StaffService`'s.
 */
@Injectable()
export class RecoveryCodesService {
  private readonly logger = new Logger(RecoveryCodesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: SessionPolicy,
  ) {}

  /**
   * The staff member's id when the code is their open one, which it marks
   * used; else null. A wrong code counts against the person's open code,
   * and the fifth withdraws it. An unknown email, a traveler, a deactivated
   * account or no open code all give null, as a wrong code does.
   */
  async redeem(
    input: { email: string; code: string },
    now: Date = new Date(),
  ): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, role: true, deactivatedAt: true },
    });
    if (!user || !isStaffRole(user.role) || user.deactivatedAt) return null;
    const open = await this.prisma.staffRecoveryCode.findFirst({
      where: { userId: user.id, usedAt: null, withdrawnAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true },
    });
    if (!open) return null;

    const typed = normalizeRecoveryCode(input.code);
    if (typed && sameHash(hashRecoveryCode(typed), open.codeHash)) {
      // Only one of two requests racing with the same code wins.
      const used = await this.prisma.staffRecoveryCode.updateMany({
        where: { id: open.id, usedAt: null, withdrawnAt: null },
        data: { usedAt: now },
      });
      if (used.count !== 1) return null;
      await this.prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'auth.recovery_code_used',
          entityType: 'User',
          entityId: user.id,
          metadata: { recoveryCodeId: open.id },
        },
      });
      await this.policy.notify(user.email, 'recovery_used', {}, now);
      return user.id;
    }

    const { failedAttempts } = await this.prisma.staffRecoveryCode.update({
      where: { id: open.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    if (recoveryFailureWithdraws(failedAttempts)) {
      const withdrawn = await this.prisma.staffRecoveryCode.updateMany({
        where: { id: open.id, usedAt: null, withdrawnAt: null },
        data: { withdrawnAt: now },
      });
      if (withdrawn.count === 1) {
        // No actor: whoever typed the codes is not known.
        await this.prisma.auditLog.create({
          data: {
            action: 'auth.recovery_code_voided',
            entityType: 'User',
            entityId: user.id,
            metadata: { recoveryCodeId: open.id, failedAttempts },
          },
        });
        this.logger.warn(
          `A recovery code for user ${user.id} was withdrawn after wrong tries`,
        );
      }
    }
    return null;
  }
}
