import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma, SupplierApplication } from '@ota/db';
import { VerificationStatus } from '@ota/domain';
import type {
  CreateSupplierApplicationRequest,
  ListSupplierApplicationsQuery,
  ReviewSupplierApplicationRequest,
  SupplierApplicationDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

    return toDto(updated);
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
