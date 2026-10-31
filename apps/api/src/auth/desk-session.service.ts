import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ownDeviceMayBeMarked } from '@ota/domain';
import type { DeskSessionDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';

interface SessionRow {
  userId: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  ownDevice: boolean;
}

const SESSION_SELECT = {
  userId: true,
  createdAt: true,
  lastActiveAt: true,
  ownDevice: true,
} as const;

/**
 * The signed-in staff session as the desk's idle lock reads and moves it
 * (`docs/schema-m9-idle-lock.md` L1–L3). The guard has already refused a
 * locked session, so nothing here can unlock one.
 */
@Injectable()
export class DeskSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
  ) {}

  async view(actor: AuthUser): Promise<DeskSessionDto> {
    return this.toDto(await this.session(actor));
  }

  /** The desk saw input (L3): the idle clock restarts now, by the server's time. */
  async activity(actor: AuthUser, now: Date = new Date()): Promise<DeskSessionDto> {
    const row = await this.prisma.session.update({
      where: { id: this.sessionId(actor) },
      data: { lastActiveAt: now },
      select: SESSION_SELECT,
    });
    return this.toDto(row);
  }

  /** The person ticked "This is my own device" at sign-in (L1): no idle lock. */
  async markOwnDevice(actor: AuthUser, now: Date = new Date()): Promise<DeskSessionDto> {
    const current = await this.session(actor);
    if (current.ownDevice) return this.toDto(current);
    if (!ownDeviceMayBeMarked(current.createdAt, now)) {
      throw new ConflictException(
        'A session is marked as your own device at sign-in; sign in again to mark it',
      );
    }
    const sessionId = this.sessionId(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: { ownDevice: true },
        select: SESSION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'auth.session_own_device',
          entityType: 'User',
          entityId: actor.id,
          metadata: { sessionId },
        },
      });
      return updated;
    });
    return this.toDto(row);
  }

  private sessionId(actor: AuthUser): string {
    if (!actor.sessionId) throw new UnauthorizedException('Authentication required');
    return actor.sessionId;
  }

  private async session(actor: AuthUser): Promise<SessionRow> {
    const row = await this.prisma.session.findUnique({
      where: { id: this.sessionId(actor) },
      select: SESSION_SELECT,
    });
    if (!row) throw new UnauthorizedException('Authentication required');
    return row;
  }

  private async toDto(row: SessionRow): Promise<DeskSessionDto> {
    const minutes = row.ownDevice
      ? null
      : (await this.settings.thresholds()).staffIdleLockMinutes;
    return {
      userId: row.userId,
      ownDevice: row.ownDevice,
      idleLockMinutes: minutes,
      signedInAt: row.createdAt.toISOString(),
      lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    };
  }
}
