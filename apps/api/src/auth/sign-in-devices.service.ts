import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import {
  deviceLabel,
  knownDeviceCutoff,
  newDeviceEmailDue,
  recordsSignInDevice,
} from '@ota/domain';
import { newDeviceSignInEmail, type Mailer } from '@ota/email';
import { createHash, randomBytes } from 'node:crypto';

import { backofficeBaseUrl } from '../common/backoffice-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

/** 32 random bytes, base64url: what this service issues as a device cookie. */
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * SHA-256 of the person's id and the cookie value; only this is stored (N1).
 * The id is part of it so one browser shared by several staff is known to
 * each of them without anyone's sign-in replacing another's device.
 */
export function hashDeviceToken(userId: string, token: string): string {
  return createHash('sha256').update(`${userId}:${token}`).digest('hex');
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * The API's side of the new-device email (`docs/schema-m9-new-device-email.md`):
 * Better Auth asks `signedIn` after every route that created a session.
 */
@Injectable()
export class SignInDevicesService {
  private readonly logger = new Logger(SignInDevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  /**
   * Records the browser a staff member signed in from and returns the device
   * cookie to set; null for anyone else (N4). A device not on file (or
   * forgotten after 180 days, N2) is audited and, while the switch is on,
   * emailed about (N3, N5). The email is sent without holding up the sign-in.
   */
  async signedIn(
    input: {
      userId: string;
      deviceToken: string | null;
      userAgent: string | null;
      ipAddress: string | null;
      signInMethod: string | null;
    },
    now: Date = new Date(),
  ): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, role: true, deactivatedAt: true },
    });
    if (!user || user.deactivatedAt || !recordsSignInDevice(user.role)) return null;

    await this.prisma.staffKnownDevice.deleteMany({
      where: { userId: user.id, lastSeenAt: { lt: knownDeviceCutoff(now) } },
    });

    const token =
      input.deviceToken && DEVICE_TOKEN.test(input.deviceToken)
        ? input.deviceToken
        : randomBytes(32).toString('base64url');
    const tokenHash = hashDeviceToken(user.id, token);
    const seen = await this.prisma.staffKnownDevice.updateMany({
      where: { tokenHash },
      data: { lastSeenAt: now },
    });
    if (seen.count > 0) return token;

    const label = deviceLabel(input.userAgent);
    try {
      await this.prisma.staffKnownDevice.create({
        data: { userId: user.id, tokenHash, label, firstSeenAt: now, lastSeenAt: now },
      });
    } catch (error) {
      // A second sign-in from the same browser recorded it first.
      if (isUniqueClash(error)) return token;
      throw error;
    }
    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'auth.new_device_sign_in',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          device: label,
          ipAddress: input.ipAddress,
          signInMethod: input.signInMethod,
        },
      },
    });

    const { staffNewDeviceEmail } = await this.settings.thresholds();
    if (
      newDeviceEmailDue({ role: user.role, known: false, enabled: staffNewDeviceEmail })
    ) {
      void this.notify(user.email, label, input, now);
    }
    return token;
  }

  private async notify(
    to: string,
    device: string,
    input: { ipAddress: string | null; signInMethod: string | null },
    at: Date,
  ): Promise<void> {
    try {
      await this.mailer.send(
        newDeviceSignInEmail({
          to,
          at,
          device,
          ipAddress: input.ipAddress,
          signInMethod: input.signInMethod,
          url: `${backofficeBaseUrl()}/login`,
          locale: this.tenant.primaryLocale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `New-device email was not sent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
