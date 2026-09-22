import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { Availability, Prisma, SupplierProfile, User } from '@ota/db';
import { VerificationStatus } from '@ota/domain';
import type { ObjectStorage } from '@ota/storage';
import type {
  AvailabilityDayDto,
  AvailabilityQuery,
  ExpiringSuppliersQuery,
  ListSuppliersQuery,
  SetAvailabilityRequest,
  SetVerificationRequest,
  SupplierDto,
  UploadCredentialRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { OBJECT_STORAGE } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

type SupplierWithUser = SupplierProfile & {
  user: Pick<User, 'email' | 'fullName'>;
};

const userSelect = { select: { email: true, fullName: true } } as const;

const MAX_CREDENTIAL_BYTES = 5 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const EXTENSION_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function credentialKey(supplierId: string, contentType: string): string {
  const extension = CONTENT_TYPE_EXTENSION[contentType] ?? 'bin';
  return `credentials/${supplierId}/${randomUUID()}.${extension}`;
}

/** The DTO reports the type from the key extension, avoiding a schema column. */
function contentTypeFromKey(key: string | null): string | null {
  if (!key) {
    return null;
  }
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_CONTENT_TYPE[extension] ?? null;
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function toAvailabilityDto(day: Availability): AvailabilityDayDto {
  return {
    id: day.id,
    supplierId: day.supplierId,
    date: day.date.toISOString().slice(0, 10),
    isAvailable: day.isAvailable,
  };
}

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
    hasCredential: supplier.credentialDocumentUrl !== null,
    credentialContentType: contentTypeFromKey(supplier.credentialDocumentUrl),
  };
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

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

  /** Suppliers whose credential is within `days` of expiry (or already expired). */
  async listExpiring(query: ExpiringSuppliersQuery): Promise<SupplierDto[]> {
    const until = new Date(Date.now() + query.days * DAY_MS);
    const suppliers = await this.prisma.supplierProfile.findMany({
      where: {
        credentialExpiresAt: { not: null, lte: until },
        verificationStatus: { not: VerificationStatus.Rejected },
      },
      include: { user: userSelect },
      orderBy: { credentialExpiresAt: 'asc' },
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

  /**
   * Store a supplier's credential document and point the profile at it. The
   * previous object, if any, is removed. The bucket is private; reads go through
   * the authorised download route.
   */
  async uploadCredential(
    id: string,
    input: UploadCredentialRequest,
    actor: AuthUser,
  ): Promise<SupplierDto> {
    const existing = await this.prisma.supplierProfile.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }

    const data = Buffer.from(input.contentBase64, 'base64');
    if (data.length === 0) {
      throw new BadRequestException('Credential file is empty');
    }
    if (data.length > MAX_CREDENTIAL_BYTES) {
      throw new BadRequestException('Credential file exceeds 5 MB');
    }

    const key = credentialKey(id, input.contentType);
    await this.storage.put(key, data, input.contentType);

    if (existing.credentialDocumentUrl) {
      await this.storage.delete(existing.credentialDocumentUrl).catch(() => undefined);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.supplierProfile.update({
        where: { id },
        data: {
          credentialDocumentUrl: key,
          ...(input.expiresAt ? { credentialExpiresAt: input.expiresAt } : {}),
        },
        include: { user: userSelect },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.credential_uploaded',
          entityType: 'SupplierProfile',
          entityId: id,
          metadata: {
            contentType: input.contentType,
            expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
          },
        },
      });

      return result;
    });

    return toDto(updated);
  }

  async readCredential(id: string): Promise<{ data: Uint8Array; contentType: string }> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id },
      select: { credentialDocumentUrl: true },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    if (!supplier.credentialDocumentUrl) {
      throw new NotFoundException('No credential on file for this supplier');
    }

    const object = await this.storage.get(supplier.credentialDocumentUrl);
    if (!object) {
      throw new NotFoundException('Credential object is missing from storage');
    }

    return { data: object.body, contentType: object.contentType };
  }

  /** Availability overrides for a worker within an inclusive date window. */
  async listAvailability(
    id: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityDayDto[]> {
    await this.requireSupplier(id);

    const where: Prisma.AvailabilityWhereInput = { supplierId: id };
    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const days = await this.prisma.availability.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    return days.map(toAvailabilityDto);
  }

  /**
   * Set one calendar day's availability (spec §5.2 single-tap toggle / granular
   * blocking). Upserts on the unique supplier+date pair and audits the change.
   */
  async setAvailability(
    id: string,
    input: SetAvailabilityRequest,
    actor: AuthUser,
  ): Promise<AvailabilityDayDto> {
    await this.requireSupplier(id);
    const date = startOfUtcDay(input.date);

    const day = await this.prisma.$transaction(async (tx) => {
      const result = await tx.availability.upsert({
        where: { supplierId_date: { supplierId: id, date } },
        create: { supplierId: id, date, isAvailable: input.isAvailable },
        update: { isAvailable: input.isAvailable },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.availability_set',
          entityType: 'SupplierProfile',
          entityId: id,
          metadata: {
            date: date.toISOString().slice(0, 10),
            isAvailable: input.isAvailable,
          },
        },
      });

      return result;
    });

    return toAvailabilityDto(day);
  }

  private async requireSupplier(id: string): Promise<void> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
  }
}
