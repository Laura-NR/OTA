import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SupplierProfile, User } from '@ota/db';
import type {
  ListSuppliersQuery,
  SetVerificationRequest,
  SupplierDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

type SupplierWithUser = SupplierProfile & {
  user: Pick<User, 'email' | 'fullName'>;
};

const userSelect = { select: { email: true, fullName: true } } as const;

function toDto(supplier: SupplierWithUser): SupplierDto {
  return {
    id: supplier.id,
    userId: supplier.userId,
    fullName: supplier.user.fullName,
    email: supplier.user.email,
    category: supplier.category,
    primaryPhone: supplier.primaryPhone,
    provincesActive: supplier.provincesActive,
    rtnLicenseNumber: supplier.rtnLicenseNumber,
    verificationStatus: supplier.verificationStatus,
    isAvailable: supplier.isAvailable,
    credentialExpiresAt: supplier.credentialExpiresAt
      ? supplier.credentialExpiresAt.toISOString()
      : null,
  };
}

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListSuppliersQuery): Promise<SupplierDto[]> {
    const where: Prisma.SupplierProfileWhereInput = {};
    if (filters.status) {
      where.verificationStatus = filters.status;
    }
    if (filters.province) {
      where.provincesActive = { has: filters.province };
    }

    const suppliers = await this.prisma.supplierProfile.findMany({
      where,
      include: { user: userSelect },
      orderBy: { createdAt: 'asc' },
    });

    return suppliers.map(toDto);
  }

  async getById(id: string): Promise<SupplierDto> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id },
      include: { user: userSelect },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }

    return toDto(supplier);
  }

  /**
   * Move a supplier through the compliance workflow (approve, reject, suspend)
   * and record the decision in the audit log.
   */
  async setVerification(
    id: string,
    input: SetVerificationRequest,
    actor: AuthUser,
  ): Promise<SupplierDto> {
    const existing = await this.prisma.supplierProfile.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.supplierProfile.update({
        where: { id },
        data: { verificationStatus: input.status },
        include: { user: userSelect },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.verification',
          entityType: 'SupplierProfile',
          entityId: id,
          metadata: {
            from: existing.verificationStatus,
            to: input.status,
            reason: input.reason ?? null,
          },
        },
      });

      return result;
    });

    return toDto(updated);
  }
}
