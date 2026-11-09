import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  UserRole,
  maskWorkerPhone,
  normalizeWorkerCode,
  normalizeWorkerPhone,
  workerCodeExpiresAt,
  workerCodeFailureVoids,
  workerCodeFromBytes,
  workerCodeMayResend,
  workerCodeSms,
  workerSessionExpiresAt,
} from '@ota/domain';
import type { WorkerSignInCodeDto } from '@ota/schemas';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { SmsChannel } from '../sms/sms.channel';
import { SMS_CHANNEL } from '../sms/sms.module';

/** How the open code reached the worker. */
type CodeRoute = 'sms' | 'desk';

/** What the verification row's value holds; the code itself is never stored. */
interface StoredCode {
  hash: string;
  failedAttempts: number;
  via: CodeRoute;
}

/** Wrong-try updates retried when another request changed the row first. */
const UPDATE_RETRIES = 3;

/** SHA-256 of a normalised code; only this is stored. */
export function hashWorkerCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The worker's code lives in Better Auth's verification table under this key. */
export function workerCodeIdentifier(userId: string): string {
  return `worker-code:${userId}`;
}

function parse(value: string): StoredCode | null {
  try {
    const stored = JSON.parse(value) as Partial<StoredCode>;
    return typeof stored.hash === 'string' && typeof stored.failedAttempts === 'number'
      ? {
          hash: stored.hash,
          failedAttempts: stored.failedAttempts,
          via: stored.via ?? 'sms',
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Worker sign-in codes (`docs/worker-app-plan.md` W1): Better Auth's
 * `/sign-in/worker-code/send` asks `send` to text one, the desk issues one to
 * read out (`issue`), and `/sign-in/worker-code` asks `redeem` whether a
 * number and a code sign someone in. A worker is a `SERVICE_WORKER` user, not
 * deactivated, whose supplier profile's phone matches; a code is a row in
 * Better Auth's `verification` table, so no migration was needed.
 */
@Injectable()
export class WorkerCodesService {
  private readonly logger = new Logger(WorkerCodesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_CHANNEL) private readonly sms: SmsChannel,
  ) {}

  /**
   * Texts a new code when exactly one worker has this number and their last
   * code went at least 45 seconds ago; otherwise does nothing. The caller is
   * told nothing either way.
   */
  async send(input: { phone: string }, now: Date = new Date()): Promise<void> {
    const phone = normalizeWorkerPhone(input.phone);
    if (!phone) return;
    const workers = await this.workersWithPhone(phone);
    if (workers.length !== 1) {
      if (workers.length > 1) {
        this.logger.warn(`${workers.length} workers share one phone; no code was sent`);
      }
      return;
    }
    const [userId] = workers;
    const open = await this.openCode(userId!, now);
    if (open && !workerCodeMayResend(open.createdAt ?? now, now)) return;

    const code = await this.replaceCode(userId!, 'sms', now);
    await this.sms.send({ to: phone, body: workerCodeSms(code) });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'auth.worker_code_sent',
        entityType: 'User',
        entityId: userId!,
        metadata: { via: 'sms', delivered: this.sms.delivers },
      },
    });
  }

  /**
   * A new code for the supplier's worker, for the desk to read out after
   * checking their ID card (W-Login "¿Sin señal para el SMS?"). It replaces
   * any open code and is shown once.
   */
  async issue(
    supplierId: string,
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<WorkerSignInCodeDto> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id: supplierId },
      select: {
        primaryPhone: true,
        user: { select: { id: true, role: true, deactivatedAt: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.user.role !== UserRole.ServiceWorker || supplier.user.deactivatedAt) {
      throw new ConflictException({
        code: 'WORKER_CANNOT_SIGN_IN',
        message: 'This supplier has no active worker account to sign in',
      });
    }
    const phone = normalizeWorkerPhone(supplier.primaryPhone);
    if (!phone) {
      throw new ConflictException({
        code: 'WORKER_PHONE_UNREADABLE',
        message: "The supplier's phone number cannot be read; correct it first",
      });
    }
    const code = await this.replaceCode(supplier.user.id, 'desk', now);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'auth.worker_code_issued',
        entityType: 'User',
        entityId: supplier.user.id,
        metadata: { supplierId },
      },
    });
    return {
      code,
      expiresAt: workerCodeExpiresAt(now).toISOString(),
      phone: maskWorkerPhone(phone),
    };
  }

  /**
   * The worker this number and code sign in, with when their session ends,
   * when the code is their open one, which it uses up; else null. A wrong
   * code counts against the open code of each worker with that number, and
   * the fifth voids it.
   */
  async redeem(
    input: { phone: string; code: string },
    now: Date = new Date(),
  ): Promise<{ userId: string; expiresAt: Date } | null> {
    const phone = normalizeWorkerPhone(input.phone);
    if (!phone) return null;
    const typed = normalizeWorkerCode(input.code);
    for (const userId of await this.workersWithPhone(phone)) {
      const open = await this.openCode(userId, now);
      if (!open) continue;
      if (typed && sameHash(hashWorkerCode(typed), open.stored.hash)) {
        // Only one of two requests racing with the same code wins.
        const used = await this.prisma.verification.deleteMany({
          where: { id: open.id, value: open.value },
        });
        if (used.count !== 1) return null;
        await this.prisma.auditLog.create({
          data: {
            actorUserId: userId,
            action: 'auth.worker_code_used',
            entityType: 'User',
            entityId: userId,
            metadata: { via: open.stored.via },
          },
        });
        return { userId, expiresAt: workerSessionExpiresAt(now) };
      }
      await this.countWrongTry(userId, now);
    }
    return null;
  }

  /** The non-deactivated workers whose supplier phone is this number. */
  private async workersWithPhone(phone: string): Promise<string[]> {
    const candidates = await this.prisma.supplierProfile.findMany({
      where: {
        // Stored numbers keep their spaces, so match the last two digits and
        // compare the normalised forms here.
        primaryPhone: { contains: phone.slice(-2) },
        user: { role: UserRole.ServiceWorker, deactivatedAt: null },
      },
      select: { userId: true, primaryPhone: true },
    });
    return candidates
      .filter((candidate) => normalizeWorkerPhone(candidate.primaryPhone) === phone)
      .map((candidate) => candidate.userId);
  }

  private async openCode(userId: string, now: Date) {
    const row = await this.prisma.verification.findFirst({
      where: { identifier: workerCodeIdentifier(userId), expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    const stored = row ? parse(row.value) : null;
    return row && stored ? { ...row, stored } : null;
  }

  /** Draws a code, stores its hash in place of any other, and returns it. */
  private async replaceCode(userId: string, via: CodeRoute, now: Date): Promise<string> {
    const code = workerCodeFromBytes(randomBytes(32));
    const identifier = workerCodeIdentifier(userId);
    const stored: StoredCode = { hash: hashWorkerCode(code), failedAttempts: 0, via };
    await this.prisma.$transaction([
      this.prisma.verification.deleteMany({ where: { identifier } }),
      this.prisma.verification.create({
        data: {
          id: globalThis.crypto.randomUUID(),
          identifier,
          value: JSON.stringify(stored),
          expiresAt: workerCodeExpiresAt(now),
          createdAt: now,
          updatedAt: now,
        },
      }),
    ]);
    return code;
  }

  /**
   * Adds a wrong try to the open code, and voids it on the fifth. The row is
   * rewritten only if no other request changed it first, retrying otherwise,
   * so parallel guesses each count.
   */
  private async countWrongTry(userId: string, now: Date): Promise<void> {
    for (let attempt = 0; attempt < UPDATE_RETRIES; attempt += 1) {
      const open = await this.openCode(userId, now);
      if (!open) return;
      const failedAttempts = open.stored.failedAttempts + 1;
      if (workerCodeFailureVoids(failedAttempts)) {
        const voided = await this.prisma.verification.deleteMany({
          where: { id: open.id, value: open.value },
        });
        if (voided.count !== 1) continue;
        // No actor: whoever typed the codes is not known.
        await this.prisma.auditLog.create({
          data: {
            action: 'auth.worker_code_voided',
            entityType: 'User',
            entityId: userId,
            metadata: { failedAttempts },
          },
        });
        this.logger.warn(`A worker code for user ${userId} was voided after wrong tries`);
        return;
      }
      const counted = await this.prisma.verification.updateMany({
        where: { id: open.id, value: open.value },
        data: {
          value: JSON.stringify({ ...open.stored, failedAttempts }),
          updatedAt: now,
        },
      });
      if (counted.count === 1) return;
    }
  }
}
