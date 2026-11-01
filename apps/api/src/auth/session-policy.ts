import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthSession, PasskeyChange } from '@ota/auth';
import type { TenantConfig } from '@ota/config';
import {
  PASSKEY_SIGN_IN_METHOD,
  RECOVERY_CODE_SIGN_IN_METHOD,
  isRecoverySessionOver,
  isStaffRole,
  isStaffSessionExpired,
  isStaffSessionLocked,
  passkeyChangeRefusal,
  passkeyRefusal,
  staffPasskeysEnforced,
  type PasskeyChangeRefusal,
  type PasskeyRefusal,
} from '@ota/domain';
import { passkeyChangeEmail, type Mailer, type PasskeyChangeKind } from '@ota/email';
import type { PasskeyStatusDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { backofficeBaseUrl } from '../common/backoffice-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

/** Hours after sign-in when a staff session ends (M9 D9); config, 12 by default. */
function staffSessionHours(): number {
  const value = Number(process.env.STAFF_SESSION_HOURS);
  return Number.isFinite(value) && value > 0 ? value : 12;
}

/**
 * Why a session may not act, or null when it may: a deactivated account, a
 * staff session past its limit, or a recovery-code session past its 15
 * minutes (`docs/schema-m9-recovery-codes.md` R3). The passkey rule comes on
 * top of this, in `SessionPolicy.refusal`.
 */
export function sessionRefusal(
  session: AuthSession,
  now: Date = new Date(),
): string | null {
  if (session.user.deactivatedAt) {
    return 'This account is deactivated';
  }
  const signedInAt = session.session.createdAt;
  if (
    signedInAt &&
    isStaffSessionExpired(
      session.user.role,
      new Date(signedInAt),
      now,
      staffSessionHours(),
    )
  ) {
    return 'The desk session ended; sign in again';
  }
  if (
    signedInAt &&
    isRecoverySessionOver(session.session.signInMethod, new Date(signedInAt), now)
  ) {
    return 'The recovery session ended; ask a Super Admin for a new code';
  }
  return null;
}

/**
 * Whether a socket may stay connected: the guard's rules, passkey rule
 * included, with no route exception. A failed check disconnects.
 */
export async function sessionMayConnect(
  policy: SessionPolicy,
  session: AuthSession,
  logger: Logger,
): Promise<boolean> {
  try {
    return (await policy.refusal(session)) === null;
  } catch (error) {
    logger.warn(
      `Socket refused: the session check failed (${error instanceof Error ? error.message : String(error)})`,
    );
    return false;
  }
}

/**
 * `session`: deactivated or past the staff limit; `locked`: the desk's idle
 * lock (`docs/schema-m9-idle-lock.md`); the others are the passkey rule.
 */
export type SessionRefusal = {
  kind: 'session' | 'locked' | PasskeyRefusal;
  message: string;
  /** For `locked`: the applied limit, which the lock screen names. */
  idleLockMinutes?: number;
};

/** The error code of a refusal for an idle-locked desk session (L5). */
export const SESSION_LOCKED_CODE = 'SESSION_LOCKED';

const LOCKED_MESSAGE = 'The desk locked after a period with no input; unlock it';

const PASSKEY_MESSAGES: Record<PasskeyRefusal, string> = {
  enroll: 'Set up a passkey to use the desk',
  use_passkey: 'Sign in to the desk with your passkey',
};

const CHANGE_MESSAGES: Record<PasskeyChangeRefusal, string> = {
  PASSKEY_SESSION_REQUIRED: 'Sign in with a passkey to change your passkeys',
  LAST_PASSKEY: 'Staff must sign in with a passkey, so the last one stays',
};

/**
 * Who may use a session (`docs/schema-m9-passkeys.md`,
 * `docs/schema-m9-idle-lock.md`): the account and staff-session rules, the
 * idle lock, then the staff passkey rule. The guard, the `/ops` and
 * `/conversations` gateways and the T-Events intake share it; Better Auth's
 * session routes ask `gateRefusal`, and its passkey routes ask
 * `changeRefusal` before a staff member's passkeys change.
 */
@Injectable()
export class SessionPolicy {
  private readonly logger = new Logger(SessionPolicy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  /** The rule is in force: the applied switch, unless the deploy's break-glass (P5). */
  async passkeysRequired(): Promise<boolean> {
    const { staffPasskeysRequired } = await this.settings.thresholds();
    return staffPasskeysEnforced(
      staffPasskeysRequired,
      process.env.STAFF_PASSKEYS_OVERRIDE,
    );
  }

  async refusal(
    session: AuthSession,
    now: Date = new Date(),
  ): Promise<SessionRefusal | null> {
    const message = sessionRefusal(session, now);
    if (message) return { kind: 'session', message };
    const lockedAfter = await this.idleLockedAfter(session, now);
    if (lockedAfter !== null) {
      return { kind: 'locked', message: LOCKED_MESSAGE, idleLockMinutes: lockedAfter };
    }
    const passkey = await this.passkeyRefusal(
      session.user.id,
      session.user.role,
      session.session.signInMethod,
    );
    return passkey ? { kind: passkey, message: PASSKEY_MESSAGES[passkey] } : null;
  }

  /**
   * The idle lock (L1, L2): the applied limit in minutes when a staff session
   * has reported no input for that long, else null. Travelers and own-device
   * sessions never read the setting, and a session with no sign-in time is
   * left to the other rules.
   */
  async idleLockedAfter(
    session: AuthSession,
    now: Date = new Date(),
  ): Promise<number | null> {
    const { role } = session.user;
    const { createdAt, lastActiveAt, ownDevice } = session.session;
    if (!isStaffRole(role) || ownDevice === true || !createdAt) return null;
    const { staffIdleLockMinutes } = await this.settings.thresholds();
    const locked = isStaffSessionLocked({
      role,
      ownDevice,
      lastActiveAt: lastActiveAt ? new Date(lastActiveAt) : null,
      signedInAt: new Date(createdAt),
      now,
      minutes: staffIdleLockMinutes,
    });
    return locked ? staffIdleLockMinutes : null;
  }

  /**
   * Better Auth's routes ask this before acting on a session (L5): the
   * account, staff-limit and idle rules. The passkey rule is left out, since
   * a setup-only session enrolls through those routes (P3).
   */
  async gateRefusal(
    session: AuthSession,
    now: Date = new Date(),
  ): Promise<{ code: string; message: string } | null> {
    const message = sessionRefusal(session, now);
    if (message) return { code: 'SESSION_REFUSED', message };
    if ((await this.idleLockedAfter(session, now)) !== null) {
      return { code: SESSION_LOCKED_CODE, message: LOCKED_MESSAGE };
    }
    return null;
  }

  /** The setup page's view of the signed-in person (P3, P4). */
  async status(user: AuthUser): Promise<PasskeyStatusDto> {
    const [required, passkeys] = await Promise.all([
      this.passkeysRequired(),
      this.prisma.passkey.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          deviceType: true,
          backedUp: true,
        },
      }),
    ]);
    const state = passkeyRefusal({
      role: user.role,
      required,
      signInMethod: user.signInMethod,
      passkeyCount: passkeys.length,
    });
    return {
      required,
      passkeySession: user.signInMethod === PASSKEY_SIGN_IN_METHOD,
      recoverySession: user.signInMethod === RECOVERY_CODE_SIGN_IN_METHOD,
      state: state ?? 'ok',
      passkeys: passkeys.map((passkey) => ({
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt?.toISOString() ?? null,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
      })),
    };
  }

  /** Better Auth's passkey routes ask this before a passkey changes (P4). */
  async changeRefusal(input: {
    userId: string;
    signInMethod: string | null;
    change: PasskeyChange;
  }): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { role: true },
    });
    if (!user || !isStaffRole(user.role)) return null;
    const [required, passkeyCount] = await Promise.all([
      this.passkeysRequired(),
      this.prisma.passkey.count({ where: { userId: input.userId } }),
    ]);
    const refusal = passkeyChangeRefusal({
      role: user.role,
      required,
      signInMethod: input.signInMethod,
      passkeyCount,
      change: input.change,
    });
    return refusal ? CHANGE_MESSAGES[refusal] : null;
  }

  /**
   * After a staff member's passkey was added or removed: an audit row and an
   * email to the work address. A failure is logged; the change stands.
   */
  async passkeyChanged(input: {
    userId: string;
    change: 'added' | 'removed';
    passkeyId: string;
    name: string | null;
  }): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, role: true },
      });
      if (!user || !isStaffRole(user.role)) return;
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.userId,
          action:
            input.change === 'added' ? 'auth.passkey_added' : 'auth.passkey_removed',
          entityType: 'User',
          entityId: input.userId,
          metadata: { passkeyId: input.passkeyId },
        },
      });
      await this.notify(user.email, input.change, { passkeyName: input.name });
    } catch (error) {
      this.logger.warn(
        `Passkey ${input.change} for user ${input.userId} was not recorded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Email a staff member that their passkeys changed. Never throws. */
  async notify(
    to: string,
    change: PasskeyChangeKind,
    details: { passkeyName?: string | null; actorName?: string | null } = {},
    now: Date = new Date(),
  ): Promise<void> {
    const locale = this.tenant.primaryLocale;
    try {
      await this.mailer.send(
        passkeyChangeEmail({
          to,
          change,
          ...details,
          when: new Intl.DateTimeFormat(locale, {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'UTC',
          }).format(now),
          url: `${backofficeBaseUrl()}/passkeys`,
          locale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Passkey ${change} email was not sent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async passkeyRefusal(
    userId: string,
    role: string | null | undefined,
    signInMethod: string | null | undefined,
  ): Promise<PasskeyRefusal | null> {
    // Travelers, suppliers and passkey sessions never read the setting, and a
    // recovery-code session may only set up a passkey whatever it says (R3).
    if (!isStaffRole(role) || signInMethod === PASSKEY_SIGN_IN_METHOD) return null;
    if (
      signInMethod !== RECOVERY_CODE_SIGN_IN_METHOD &&
      !(await this.passkeysRequired())
    ) {
      return null;
    }
    const passkeyCount = await this.prisma.passkey.count({ where: { userId } });
    return passkeyRefusal({ role, required: true, signInMethod, passkeyCount });
  }
}
