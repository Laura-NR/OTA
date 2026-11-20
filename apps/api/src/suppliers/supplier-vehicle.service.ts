import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@ota/db';
import {
  credentialsSupersededByVehicle,
  normalizeWorkerPhone,
  vehicleRequestRefusal,
  vehicleReviewSms,
  type SupplierCategory,
} from '@ota/domain';
import type {
  RejectVehicleRequest,
  SupplierDetailDto,
  VehicleRequest,
  WorkerCredentialsDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { SmsChannel } from '../sms/sms.channel';
import { SMS_CHANNEL } from '../sms/sms.module';
import { SupplierCredentialsService } from './supplier-credentials.service';
import { SuppliersService } from './suppliers.service';
import { readVehicleJson, writeVehicleJson, type StoredVehicle } from './vehicle-json';

/**
 * A driver's vehicle change (`docs/schema-w-vehicle.md` X1a, X2a): the worker
 * asks from the app, the desk approves or rejects on the supplier page. The
 * current vehicle stays on file, and in dispatch, until the desk approves.
 * Every step locks the profile row, since the JSON is read and written whole.
 */
@Injectable()
export class SupplierVehicleService {
  private readonly logger = new Logger(SupplierVehicleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: SupplierCredentialsService,
    private readonly suppliers: SuppliersService,
    @Inject(SMS_CHANNEL) private readonly sms: SmsChannel,
  ) {}

  /** The worker's request; a new one replaces a request still waiting. */
  async request(
    actor: AuthUser,
    input: VehicleRequest,
    now: Date = new Date(),
  ): Promise<WorkerCredentialsDto> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true, category: true },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }
    if (vehicleRequestRefusal(profile.category as SupplierCategory)) {
      throw new UnprocessableEntityException('Vehicle details are recorded for drivers');
    }

    await this.prisma.$transaction(async (tx) => {
      const stored = await this.lock(tx, profile.id);
      const pending = { ...input, requestedAt: now.toISOString() };
      await tx.supplierProfile.update({
        where: { id: profile.id },
        data: {
          vehicleDetails: writeVehicleJson({ ...stored, pending, rejection: null }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.vehicle_requested',
          entityType: 'SupplierProfile',
          entityId: profile.id,
          metadata: {
            requested: input,
            replaced: stored.pending,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return this.credentials.forWorker(actor);
  }

  /**
   * The request becomes the vehicle; the desk's own fields (extras, insurance
   * name, routes) carry over. A different plate supersedes the documents that
   * named the old car, so offers pause until the new ones are approved.
   */
  async approve(supplierId: string, actor: AuthUser): Promise<SupplierDetailDto> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const stored = await this.lock(tx, supplierId);
      const pending = this.pendingOf(stored);
      const { requestedAt: _requestedAt, ...requested } = pending;
      const next = {
        extras: null,
        insurance: null,
        routes: [],
        ...stored.current,
        ...requested,
      };
      const kinds = credentialsSupersededByVehicle(
        stored.current?.plate ?? null,
        requested.plate,
      );
      const superseded = await this.credentials.supersedeVerified(tx, supplierId, kinds);

      await tx.supplierProfile.update({
        where: { id: supplierId },
        data: {
          vehicleDetails: writeVehicleJson({
            current: next,
            pending: null,
            rejection: null,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.vehicle_approved',
          entityType: 'SupplierProfile',
          entityId: supplierId,
          metadata: {
            previous: stored.current,
            next,
            superseded: superseded.map((row) => row.id),
          } as Prisma.InputJsonValue,
        },
      });
      return { superseded, newDocuments: kinds.length > 0 };
    });

    await this.credentials.removeFiles(outcome.superseded.map((row) => row.storageKey));
    await this.tellWorker(supplierId, true, outcome.newDocuments);
    return this.suppliers.getById(supplierId);
  }

  /** The request is dropped; the worker reads the reason in the app until asking again. */
  async reject(
    supplierId: string,
    input: RejectVehicleRequest,
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<SupplierDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const stored = await this.lock(tx, supplierId);
      const pending = this.pendingOf(stored);
      const rejection = {
        model: pending.model,
        plate: pending.plate,
        reason: input.reason,
        rejectedAt: now.toISOString(),
      };
      await tx.supplierProfile.update({
        where: { id: supplierId },
        data: {
          vehicleDetails: writeVehicleJson({ ...stored, pending: null, rejection }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.vehicle_rejected',
          entityType: 'SupplierProfile',
          entityId: supplierId,
          metadata: { requested: pending, reason: input.reason } as Prisma.InputJsonValue,
        },
      });
    });

    await this.tellWorker(supplierId, false, false);
    return this.suppliers.getById(supplierId);
  }

  /** Lock the profile row for the rest of the transaction, then read its vehicle. */
  private async lock(
    tx: Prisma.TransactionClient,
    supplierId: string,
  ): Promise<StoredVehicle> {
    await tx.$queryRaw`SELECT id FROM supplier_profiles WHERE id = ${supplierId}::uuid FOR UPDATE`;
    const supplier = await tx.supplierProfile.findUnique({
      where: { id: supplierId },
      select: { vehicleDetails: true },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }
    return readVehicleJson(supplier.vehicleDetails);
  }

  private pendingOf(stored: StoredVehicle): NonNullable<StoredVehicle['pending']> {
    if (!stored.pending) {
      throw new ConflictException('No vehicle change is waiting for review');
    }
    return stored.pending;
  }

  private async tellWorker(
    supplierId: string,
    approved: boolean,
    newDocuments: boolean,
  ): Promise<void> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id: supplierId },
      select: { primaryPhone: true },
    });
    const phone = supplier ? normalizeWorkerPhone(supplier.primaryPhone) : null;
    if (!phone) return;
    try {
      await this.sms.send({ to: phone, body: vehicleReviewSms(approved, newDocuments) });
    } catch (error) {
      // The review stands; the app shows the outcome whether or not the SMS left.
      this.logger.warn(`Vehicle review SMS failed: ${(error as Error).message}`);
    }
  }
}
