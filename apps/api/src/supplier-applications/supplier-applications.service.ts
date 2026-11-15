import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { TenantConfig } from '@ota/config';
import type { Prisma, SupplierApplication } from '@ota/db';
import { VerificationStatus, normalizeWorkerPhone, workerAppLinkSms } from '@ota/domain';
import { workerAppInviteEmail, type Mailer } from '@ota/email';
import type {
  CreateSupplierApplicationRequest,
  ListSupplierApplicationsQuery,
  ReviewSupplierApplicationRequest,
  SupplierApplicationDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import type { SmsChannel } from '../sms/sms.channel';
import { SMS_CHANNEL } from '../sms/sms.module';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { workerAppPublicUrl } from '../worker-app/worker-app.service';

function toDto(application: SupplierApplication): SupplierApplicationDto {
  return {
    id: application.id,
    fullName: application.fullName,
    email: application.email,
    phone: application.phone,
    category: application.category,
    provincesActive: application.provincesActive,
    rtnLicenseNumber: application.rtnLicenseNumber,
    message: application.message,
    status: application.status,
    createdAt: application.createdAt.toISOString(),
    reviewedAt: application.reviewedAt ? application.reviewedAt.toISOString() : null,
  };
}

/**
 * Public supplier recruitment and the operator review that provisions an
 * account (spec §4.6). Nothing is created up front: a User + SupplierProfile are
 * only written when an operator approves, so a stray application cannot collide
 * with Better Auth's own sign-up.
 */
@Injectable()
export class SupplierApplicationsService {
  private readonly logger = new Logger(SupplierApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SMS_CHANNEL) private readonly sms: SmsChannel,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async submit(input: CreateSupplierApplicationRequest): Promise<SupplierApplicationDto> {
    const pending = await this.prisma.supplierApplication.findFirst({
      where: { email: input.email, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('An application for this email is already pending');
    }

    const application = await this.prisma.supplierApplication.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        category: input.category,
        provincesActive: input.provincesActive,
        rtnLicenseNumber: input.rtnLicenseNumber,
        message: input.message ?? null,
        status: 'PENDING',
      },
    });
    await this.audit(null, 'supplier_application.submitted', application.id, {
      email: application.email,
    });
    return toDto(application);
  }

  async list(query: ListSupplierApplicationsQuery): Promise<SupplierApplicationDto[]> {
    const rows = await this.prisma.supplierApplication.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async approve(id: string, actor: AuthUser): Promise<SupplierApplicationDto> {
    const application = await this.load(id);
    if (application.status !== 'PENDING') {
      throw new ConflictException(`Application is already ${application.status}`);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: application.email },
    });
    if (existingUser) {
      const profile = await this.prisma.supplierProfile.findUnique({
        where: { userId: existingUser.id },
        select: { id: true },
      });
      if (profile) {
        throw new ConflictException('This applicant is already a registered supplier');
      }
    }
    const licenseTaken = await this.prisma.supplierProfile.findUnique({
      where: { rtnLicenseNumber: application.rtnLicenseNumber },
      select: { id: true },
    });
    if (licenseTaken) {
      throw new ConflictException('That RTN licence is already registered');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email: application.email,
            fullName: application.fullName,
            phone: application.phone,
            role: 'SERVICE_WORKER',
          },
        }));

      await tx.supplierProfile.create({
        data: {
          userId: user.id,
          category: application.category,
          primaryPhone: application.phone,
          provincesActive: application.provincesActive,
          rtnLicenseNumber: application.rtnLicenseNumber,
          verificationStatus: VerificationStatus.PendingAudit,
          isAvailable: true,
        },
      });

      const result = await tx.supplierApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier_application.approved',
          entityType: 'SupplierApplication',
          entityId: id,
          metadata: { email: application.email },
        },
      });

      return result;
    });

    await this.sendAppLink(application);
    return toDto(updated);
  }

  /**
   * U6a: the new worker receives the download page by email and SMS (none
   * leaves in production until an SMS provider exists). Best-effort: the
   * approval stands, and the desk's QR card carries the same link.
   */
  private async sendAppLink(application: SupplierApplication): Promise<void> {
    const url = workerAppPublicUrl();
    try {
      await this.mailer.send(
        workerAppInviteEmail({
          to: application.email,
          phone: application.phone,
          url,
          locale: this.tenant.primaryLocale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Approval ${application.id}: the app link could not be emailed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const phone = normalizeWorkerPhone(application.phone);
    const body = workerAppLinkSms(url);
    if (!phone || !body) return;
    try {
      await this.sms.send({ to: phone, body });
    } catch (error) {
      this.logger.warn(
        `Approval ${application.id}: the app link could not be texted: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async reject(
    id: string,
    input: ReviewSupplierApplicationRequest,
    actor: AuthUser,
  ): Promise<SupplierApplicationDto> {
    const application = await this.load(id);
    if (application.status !== 'PENDING') {
      throw new ConflictException(`Application is already ${application.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.supplierApplication.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier_application.rejected',
          entityType: 'SupplierApplication',
          entityId: id,
          metadata: { email: application.email, reason: input.reason ?? null },
        },
      });

      return result;
    });

    return toDto(updated);
  }

  private async load(id: string): Promise<SupplierApplication> {
    const application = await this.prisma.supplierApplication.findUnique({
      where: { id },
    });
    if (!application) {
      throw new NotFoundException(`Supplier application ${id} not found`);
    }
    return application;
  }

  private async audit(
    actorUserId: string | null,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        entityType: 'SupplierApplication',
        entityId,
        metadata,
      },
    });
  }
}
