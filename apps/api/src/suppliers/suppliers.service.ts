import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  Availability,
  Prisma,
  SupplierProfile,
  SupplierResources,
  User,
} from '@ota/db';
import {
  JOB_STATUSES,
  ReservationStatus,
  SupplierCategory,
  VerificationStatus,
  hasBackupPower,
  isResourcesStale,
  jobsInWindow,
  lastJob,
  resourcesIssue,
  supplierPower,
  type PowerFacts,
  type ResourcesIssue,
  type SupplierJob,
} from '@ota/domain';
import type { ObjectStorage } from '@ota/storage';
import { vehicleDetailsSchema } from '@ota/schemas';
import type {
  AvailabilityDayDto,
  AvailabilityQuery,
  ConfirmResourcesRequest,
  ExpiringSuppliersQuery,
  ListSuppliersQuery,
  SetAvailabilityRequest,
  SetVerificationRequest,
  SupplierDetailDto,
  SupplierDto,
  SupplierLastJobDto,
  SupplierResourcesDto,
  SupplierRowDto,
  UploadCredentialRequest,
  VehicleDetailsDto,
  VehicleDetailsRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { OBJECT_STORAGE } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

type SupplierWithUser = SupplierProfile & {
  user: Pick<User, 'email' | 'fullName'>;
};

const userSelect = { select: { email: true, fullName: true } } as const;

/** The register and the inspector read the confirmed resources and who confirmed them. */
const resourcesInclude = {
  include: { confirmedBy: { select: { email: true, fullName: true } } },
} as const;

type ResourcesRow = SupplierResources & {
  confirmedBy: Pick<User, 'email' | 'fullName'> | null;
};

type SupplierWithResources = SupplierWithUser & {
  /** Absent when never confirmed (and in tests whose fakes ignore `include`). */
  resources?: ResourcesRow | null;
};

type JobRow = SupplierJob & { supplierId: string };

const RESOURCES_ISSUE_MESSAGE: Record<ResourcesIssue, string> = {
  NO_RESOURCES_FOR_CATEGORY: 'Only casas and drivers record resources',
  GENERATOR_REQUIRED: 'A casa states its generator, None included',
  GENERATOR_DETAILS_WITHOUT_GENERATOR:
    'Generator hours, schedule and fuel days need a generator',
  FUEL_ON_CASA: 'The fuel reserve is recorded for drivers',
  FUEL_REQUIRED: 'A driver states the fuel reserve in litres',
  CASA_FIELDS_ON_DRIVER: 'Power, water and rooms are recorded for casas',
};

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

function powerFacts(resources: SupplierResources | null): PowerFacts | null {
  if (!resources) return null;
  return {
    generator: resources.generator,
    generatorHoursPerDay: resources.generatorHoursPerDay,
    solarBatteryKwh:
      resources.solarBatteryKwh === null ? null : Number(resources.solarBatteryKwh),
    fuelReserveLitres: resources.fuelReserveLitres,
  };
}

function toResourcesDto(resources: ResourcesRow, now: Date): SupplierResourcesDto {
  return {
    generator: resources.generator,
    generatorHoursPerDay: resources.generatorHoursPerDay,
    generatorSchedule: resources.generatorSchedule,
    generatorFuelDays: resources.generatorFuelDays,
    solarBatteryKwh:
      resources.solarBatteryKwh === null ? null : Number(resources.solarBatteryKwh),
    waterTankLitres: resources.waterTankLitres,
    rooms: resources.rooms,
    guestCapacity: resources.guestCapacity,
    fuelReserveLitres: resources.fuelReserveLitres,
    confirmedAt: resources.confirmedAt.toISOString(),
    confirmedByName: resources.confirmedBy
      ? (resources.confirmedBy.fullName ?? resources.confirmedBy.email)
      : null,
    confirmedVia: resources.confirmedVia,
    stale: isResourcesStale(resources.confirmedAt, now),
  };
}

function toLastJobDto(job: JobRow | null): SupplierLastJobDto | null {
  return job
    ? {
        startsAt: job.startsAt.toISOString(),
        serviceType: job.serviceType,
        province: job.province,
      }
    : null;
}

function toRowDto(
  supplier: SupplierWithResources,
  jobs: readonly JobRow[],
  now: Date,
): SupplierRowDto {
  const resources = supplier.resources ?? null;
  const facts = powerFacts(resources);
  return {
    ...toDto(supplier),
    power: {
      ...supplierPower(supplier.category, facts),
      backup: hasBackupPower(supplier.category, facts),
      confirmedAt: resources ? resources.confirmedAt.toISOString() : null,
      stale: resources ? isResourcesStale(resources.confirmedAt, now) : false,
    },
    lastJob: toLastJobDto(lastJob(jobs, now)),
  };
}

/** The stored vehicle, or null when there is none or it does not match the shape. */
function storedVehicle(value: Prisma.JsonValue | null): VehicleDetailsDto | null {
  const parsed = vehicleDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The resources row's values, as the audit log records them before and after (D8). */
function resourcesValues(
  resources: SupplierResources | ConfirmResourcesRequest | null,
): Record<string, unknown> | null {
  if (!resources) return null;
  return {
    generator: resources.generator,
    generatorHoursPerDay: resources.generatorHoursPerDay,
    generatorSchedule: resources.generatorSchedule,
    generatorFuelDays: resources.generatorFuelDays,
    solarBatteryKwh:
      resources.solarBatteryKwh === null ? null : Number(resources.solarBatteryKwh),
    waterTankLitres: resources.waterTankLitres,
    rooms: resources.rooms,
    guestCapacity: resources.guestCapacity,
    fuelReserveLitres: resources.fuelReserveLitres,
  };
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * The register: each supplier with its Power and Last job columns (M6 D1,
   * D3). `backupPower` keeps the suppliers that pass `hasBackupPower`.
   */
  async list(filters: ListSuppliersQuery): Promise<SupplierRowDto[]> {
    const where: Prisma.SupplierProfileWhereInput = {};
    if (filters.status) {
      where.verificationStatus = filters.status;
    }
    if (filters.province) {
      where.provincesActive = { has: filters.province };
    }

    const suppliers: SupplierWithResources[] = await this.prisma.supplierProfile.findMany(
      {
        where,
        include: { user: userSelect, resources: resourcesInclude },
        orderBy: { createdAt: 'asc' },
      },
    );
    const now = new Date();
    const jobs = await this.jobs(
      suppliers.map((supplier) => supplier.id),
      now,
    );

    const rows = suppliers.map((supplier) =>
      toRowDto(supplier, jobs.get(supplier.id) ?? [], now),
    );
    return filters.backupPower ? rows.filter((row) => row.power.backup) : rows;
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

  /** The inspector: the register row, the confirmed resources and the jobs of 12 months. */
  async getById(id: string): Promise<SupplierDetailDto> {
    const supplier: SupplierWithResources | null =
      await this.prisma.supplierProfile.findUnique({
        where: { id },
        include: { user: userSelect, resources: resourcesInclude },
      });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }

    const now = new Date();
    const jobs = (await this.jobs([id], now)).get(id) ?? [];
    const resources = supplier.resources ?? null;
    return {
      ...toRowDto(supplier, jobs, now),
      resources: resources ? toResourcesDto(resources, now) : null,
      jobs12m: jobsInWindow(jobs, now),
      vehicle: storedVehicle(supplier.vehicleDetails),
    };
  }

  /**
   * Replace a driver's vehicle (M6 D7(b)) in the profile's `vehicle_details`
   * JSON and audit the previous and new values as `supplier.vehicle_updated`.
   * The insurance date is informational: it does not pause dispatch, which
   * follows the credential rules only. Other categories get a 422.
   */
  async setVehicle(
    id: string,
    input: VehicleDetailsRequest,
    actor: AuthUser,
  ): Promise<SupplierDetailDto> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id },
      select: { category: true, vehicleDetails: true },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    if (supplier.category !== SupplierCategory.PrivateDriver) {
      throw new UnprocessableEntityException('Vehicle details are recorded for drivers');
    }
    const vehicle: VehicleDetailsDto = {
      ...input,
      insuranceUntil: input.insuranceUntil
        ? input.insuranceUntil.toISOString().slice(0, 10)
        : null,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.supplierProfile.update({
        where: { id },
        data: { vehicleDetails: vehicle },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.vehicle_updated',
          entityType: 'SupplierProfile',
          entityId: id,
          metadata: {
            previous: supplier.vehicleDetails ?? null,
            next: vehicle,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return this.getById(id);
  }

  /**
   * Record a resources confirmation (M6 D1, D4): the row is replaced wholesale
   * and stamped with the actor, the channel and now, and the previous and new
   * values are audited as `supplier.resources_confirmed` (D8). Casa fields go
   * to casas and the fuel reserve to drivers (422 otherwise).
   */
  async confirmResources(
    id: string,
    input: ConfirmResourcesRequest,
    actor: AuthUser,
  ): Promise<SupplierDetailDto> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id },
      select: { category: true, resources: true },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    const { via, ...values } = input;
    const issue = resourcesIssue(supplier.category, values);
    if (issue) {
      throw new UnprocessableEntityException(RESOURCES_ISSUE_MESSAGE[issue]);
    }

    const stamp = { confirmedAt: new Date(), confirmedById: actor.id, confirmedVia: via };
    await this.prisma.$transaction(async (tx) => {
      await tx.supplierResources.upsert({
        where: { supplierId: id },
        create: { supplierId: id, ...values, ...stamp },
        update: { ...values, ...stamp },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.resources_confirmed',
          entityType: 'SupplierProfile',
          entityId: id,
          metadata: {
            via,
            previous: resourcesValues(supplier.resources ?? null),
            next: resourcesValues(input),
          } as Prisma.InputJsonValue,
        },
      });
    });

    return this.getById(id);
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

  /**
   * The suppliers' jobs (M6 D3): service items assigned to them that were
   * accepted or done, have started, and whose booking is not cancelled. The
   * domain rules apply the same filter; the query only narrows the read.
   */
  private async jobs(
    supplierIds: readonly string[],
    now: Date,
  ): Promise<Map<string, JobRow[]>> {
    const bySupplier = new Map<string, JobRow[]>();
    if (supplierIds.length === 0) return bySupplier;
    const items = await this.prisma.serviceItem.findMany({
      where: {
        supplierId: { in: [...supplierIds] },
        status: { in: [...JOB_STATUSES] },
        serviceDateStart: { lte: now },
        reservation: { status: { not: ReservationStatus.Cancelled } },
      },
      select: {
        supplierId: true,
        serviceDateStart: true,
        status: true,
        serviceType: true,
        province: true,
        reservation: { select: { status: true } },
      },
    });
    for (const item of items) {
      if (!item.supplierId) continue;
      const list = bySupplier.get(item.supplierId) ?? [];
      list.push({
        supplierId: item.supplierId,
        startsAt: item.serviceDateStart,
        status: item.status,
        serviceType: item.serviceType,
        province: item.province,
        reservationStatus: item.reservation.status,
      });
      bySupplier.set(item.supplierId, list);
    }
    return bySupplier;
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
