import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, SupplierCredential } from '@ota/db';
import {
  credentialApprovalRefusal,
  credentialPauseFrom,
  credentialReviewSms,
  credentialSlots,
  credentialState,
  credentialSummary,
  credentialUploadRefusal,
  currentCredentialExpiry,
  missingCredentials,
  normalizeWorkerPhone,
  type CredentialApprovalRefusal,
  type CredentialKind,
  type CredentialSlot,
  type CredentialUploadRefusal,
  type ResourceChannel,
  type SupplierCategory,
  type VerificationStatus,
} from '@ota/domain';
import type { ObjectStorage } from '@ota/storage';
import type {
  ApproveCredentialRequest,
  CheckIdentityCardRequest,
  CredentialSlotDto,
  CredentialVersionDto,
  RejectCredentialRequest,
  SupplierCredentialsDto,
  WorkerCredentialsDto,
  WorkerUploadCredentialRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import type { SmsChannel } from '../sms/sms.channel';
import { SMS_CHANNEL } from '../sms/sms.module';
import { OBJECT_STORAGE } from '../storage/storage.module';
import { readVehicleJson } from './vehicle-json';

const MAX_CREDENTIAL_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const EXTENSION_CONTENT_TYPE = Object.fromEntries(
  Object.entries(CONTENT_TYPE_EXTENSION).map(([type, extension]) => [extension, type]),
) as Record<string, CredentialVersionDto['contentType']>;

function credentialKey(supplierId: string, contentType: string): string {
  const extension = CONTENT_TYPE_EXTENSION[contentType] ?? 'bin';
  return `credentials/${supplierId}/${randomUUID()}.${extension}`;
}

/** The DTO reports the type from the key extension, avoiding a schema column. */
function contentTypeFromKey(key: string | null): CredentialVersionDto['contentType'] {
  if (!key) return null;
  return EXTENSION_CONTENT_TYPE[key.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/** A `YYYY-MM-DD` day as the date columns store it. */
function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function dayString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function firstName(fullName: string | null | undefined): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}

const UPLOAD_REFUSAL_MESSAGE: Record<CredentialUploadRefusal, string> = {
  NOT_REQUIRED: 'This supplier’s category does not need that document',
  NO_FILE_KIND: 'The identity card is checked in person; no photo of it is kept',
};

const APPROVAL_REFUSAL_MESSAGE: Record<CredentialApprovalRefusal, string> = {
  NOT_PENDING: 'Only a document waiting for review can be approved or rejected',
  EXPIRY_REQUIRED: 'Enter the expiry date shown on the document',
  ALREADY_EXPIRED: 'The document has already expired',
  ISSUED_IN_FUTURE: 'The issue date is in the future',
};

const VERSION_INCLUDE = {
  reviewedBy: { select: { fullName: true } },
} satisfies Prisma.SupplierCredentialInclude;

type VersionRow = SupplierCredential & {
  reviewedBy?: { fullName: string | null } | null;
};

/**
 * W-Credentials (`docs/schema-w-credentials.md`): each supplier document as
 * uploaded versions. The worker uploads from the app and the desk from a
 * visit, call or WhatsApp; every upload waits for an Operations or Super Admin
 * to approve or reject it. Approving keeps one current version per kind and
 * rewrites `supplier_profiles.credential_expires_at`, the date dispatch reads
 * (V3a). Files sit in the private bucket and are removed when a version is
 * superseded or rejected (V7a).
 */
@Injectable()
export class SupplierCredentialsService {
  private readonly logger = new Logger(SupplierCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly settings: OperatingSettingsService,
    @Inject(SMS_CHANNEL) private readonly sms: SmsChannel,
  ) {}

  /** The desk's document list. */
  async forSupplier(
    supplierId: string,
    now: Date = new Date(),
  ): Promise<SupplierCredentialsDto> {
    const supplier = await this.supplier(supplierId);
    const [versions, windowDays] = await Promise.all([
      this.versions(supplierId),
      this.windowDays(),
    ]);
    const category = supplier.category as SupplierCategory;
    return {
      windowDays,
      slots: credentialSlots(category, versions).map((slot) =>
        this.toSlot(slot, now, windowDays),
      ),
      missing: missingCredentials(category, versions),
    };
  }

  /** "Mis credenciales": the worker's own documents and what they mean for offers. */
  async forWorker(
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<WorkerCredentialsDto> {
    const profile = await this.workerProfile(actor);
    const [versions, windowDays] = await Promise.all([
      this.versions(profile.id),
      this.windowDays(),
    ]);
    const slots = credentialSlots(profile.category as SupplierCategory, versions);
    const summary = credentialSummary(
      profile.verificationStatus as VerificationStatus,
      slots,
      now,
      windowDays,
    );
    const vehicle = readVehicleJson(profile.vehicleDetails);
    return {
      summary: {
        state: summary.state,
        autoOffers: summary.autoOffers,
        nextExpiry: summary.nextExpiry
          ? {
              kind: summary.nextExpiry.kind,
              expiresOn: dayString(summary.nextExpiry.expiresOn)!,
            }
          : null,
      },
      windowDays,
      slots: slots.map((slot) => this.toSlot(slot, now, windowDays)),
      vehicle: vehicle.current
        ? {
            model: vehicle.current.model,
            plate: vehicle.current.plate,
            seats: vehicle.current.seats,
            airConditioning: vehicle.current.airConditioning,
          }
        : null,
      vehicleRequest: vehicle.pending,
      vehicleRejection: vehicle.pending ? null : vehicle.rejection,
    };
  }

  /** The worker's photo from the app (V4a, V6a). */
  async uploadForWorker(
    actor: AuthUser,
    input: WorkerUploadCredentialRequest,
  ): Promise<WorkerCredentialsDto> {
    const profile = await this.workerProfile(actor);
    await this.upload(profile, input, 'WORKER_APP', actor);
    return this.forWorker(actor);
  }

  /** A document the desk received by visit, phone or WhatsApp. */
  async uploadForDesk(
    supplierId: string,
    input: WorkerUploadCredentialRequest,
    via: ResourceChannel,
    actor: AuthUser,
  ): Promise<SupplierCredentialsDto> {
    const supplier = await this.supplier(supplierId);
    await this.upload(supplier, input, via, actor);
    return this.forSupplier(supplierId);
  }

  /** The file of one version, for the desk; every read is audited ("Open full size (logged)"). */
  async readFile(
    supplierId: string,
    credentialId: string,
    actor: AuthUser,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const version = await this.version(supplierId, credentialId);
    if (!version.storageKey) {
      throw new NotFoundException('No file is kept for this document');
    }
    const object = await this.storage.get(version.storageKey);
    if (!object) {
      throw new NotFoundException('Credential object is missing from storage');
    }
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'supplier.credential_viewed',
        entityType: 'SupplierProfile',
        entityId: supplierId,
        metadata: { credentialId, kind: version.kind },
      },
    });
    return { data: object.body, contentType: object.contentType };
  }

  /**
   * Approve a pending version with what the reviewer read off it: it becomes
   * the current one, the previous current one is superseded and its file
   * removed, and the supplier's expiry is recomputed.
   */
  async approve(
    supplierId: string,
    credentialId: string,
    input: ApproveCredentialRequest,
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<SupplierCredentialsDto> {
    const supplier = await this.supplier(supplierId);
    const version = await this.version(supplierId, credentialId);
    const approval = {
      number: input.number,
      issuer: input.issuer,
      issuedOn: input.issuedOn ? dayDate(input.issuedOn) : null,
      expiresOn: input.expiresOn ? dayDate(input.expiresOn) : null,
    };
    const refusal = credentialApprovalRefusal(
      { kind: version.kind as CredentialKind, status: version.status },
      approval,
      now,
    );
    if (refusal === 'NOT_PENDING') {
      throw new ConflictException(APPROVAL_REFUSAL_MESSAGE[refusal]);
    }
    if (refusal) {
      throw new UnprocessableEntityException(APPROVAL_REFUSAL_MESSAGE[refusal]);
    }

    const superseded = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.supplierCredential.findMany({
        where: { supplierId, kind: version.kind, status: 'VERIFIED' },
        select: { id: true, storageKey: true },
      });
      await tx.supplierCredential.updateMany({
        where: { id: { in: previous.map((row) => row.id) } },
        data: { status: 'SUPERSEDED', storageKey: null },
      });
      await tx.supplierCredential.update({
        where: { id: credentialId },
        data: {
          status: 'VERIFIED',
          ...approval,
          reviewedAt: now,
          reviewedById: actor.id,
        },
      });
      await this.recomputeExpiry(tx, supplierId);
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.credential_approved',
          entityType: 'SupplierProfile',
          entityId: supplierId,
          metadata: {
            credentialId,
            kind: version.kind,
            expiresOn: input.expiresOn,
            superseded: previous.map((row) => row.id),
          },
        },
      });
      return previous;
    });

    await this.removeFiles(superseded.map((row) => row.storageKey));
    await this.tellWorker(supplier.primaryPhone, true);
    return this.forSupplier(supplierId);
  }

  /** Reject a pending version, or ask for a new upload: the reason is shown to the worker. */
  async reject(
    supplierId: string,
    credentialId: string,
    input: RejectCredentialRequest,
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<SupplierCredentialsDto> {
    const supplier = await this.supplier(supplierId);
    const version = await this.version(supplierId, credentialId);
    if (version.status !== 'PENDING_AUDIT') {
      throw new ConflictException(APPROVAL_REFUSAL_MESSAGE.NOT_PENDING);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.supplierCredential.update({
        where: { id: credentialId },
        data: {
          status: 'REJECTED',
          rejectReason: input.reason,
          storageKey: null,
          reviewedAt: now,
          reviewedById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.credential_rejected',
          entityType: 'SupplierProfile',
          entityId: supplierId,
          metadata: { credentialId, kind: version.kind, reason: input.reason },
        },
      });
    });

    await this.removeFiles([version.storageKey]);
    await this.tellWorker(supplier.primaryPhone, false);
    return this.forSupplier(supplierId);
  }

  /** The identity card checked in person (V5a): a verified version with no file. */
  async checkIdentityCard(
    supplierId: string,
    input: CheckIdentityCardRequest,
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<SupplierCredentialsDto> {
    await this.supplier(supplierId);
    await this.prisma.$transaction(async (tx) => {
      await tx.supplierCredential.updateMany({
        where: { supplierId, kind: 'IDENTITY_CARD', status: 'VERIFIED' },
        data: { status: 'SUPERSEDED' },
      });
      const created = await tx.supplierCredential.create({
        data: {
          supplierId,
          kind: 'IDENTITY_CARD',
          status: 'VERIFIED',
          uploadedAt: now,
          uploadedById: actor.id,
          uploadedVia: input.via,
          reviewedAt: now,
          reviewedById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.identity_checked',
          entityType: 'SupplierProfile',
          entityId: supplierId,
          metadata: { credentialId: created.id, via: input.via },
        },
      });
    });
    return this.forSupplier(supplierId);
  }

  private async upload(
    supplier: { id: string; category: string },
    input: WorkerUploadCredentialRequest,
    via: ResourceChannel,
    actor: AuthUser,
  ): Promise<void> {
    const refusal = credentialUploadRefusal(
      supplier.category as SupplierCategory,
      input.kind,
    );
    if (refusal) {
      throw new UnprocessableEntityException(UPLOAD_REFUSAL_MESSAGE[refusal]);
    }
    const data = Buffer.from(input.contentBase64, 'base64');
    if (data.length === 0) {
      throw new BadRequestException('Credential file is empty');
    }
    if (data.length > MAX_CREDENTIAL_BYTES) {
      throw new BadRequestException('Credential file exceeds 5 MB');
    }

    const key = credentialKey(supplier.id, input.contentType);
    await this.storage.put(key, data, input.contentType);

    // A new upload replaces a pending one: at most one waits per kind.
    const replaced = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.supplierCredential.findMany({
        where: { supplierId: supplier.id, kind: input.kind, status: 'PENDING_AUDIT' },
        select: { id: true, storageKey: true },
      });
      await tx.supplierCredential.updateMany({
        where: { id: { in: pending.map((row) => row.id) } },
        data: { status: 'SUPERSEDED', storageKey: null },
      });
      const created = await tx.supplierCredential.create({
        data: {
          supplierId: supplier.id,
          kind: input.kind,
          storageKey: key,
          uploadedById: actor.id,
          uploadedVia: via,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.credential_uploaded',
          entityType: 'SupplierProfile',
          entityId: supplier.id,
          metadata: {
            credentialId: created.id,
            kind: input.kind,
            via,
            contentType: input.contentType,
            replaced: pending.map((row) => row.id),
          },
        },
      });
      return pending;
    });
    await this.removeFiles(replaced.map((row) => row.storageKey));
  }

  /**
   * A new vehicle's approval (`docs/schema-w-vehicle.md` X2a): the verified
   * versions of these kinds are superseded and the expiry recomputed, inside
   * the caller's transaction. Returns their storage keys, for `removeFiles`
   * once the transaction commits. A pending upload stays: it may already be
   * the new car's.
   */
  async supersedeVerified(
    tx: Prisma.TransactionClient,
    supplierId: string,
    kinds: readonly CredentialKind[],
  ): Promise<{ id: string; storageKey: string | null }[]> {
    if (kinds.length === 0) return [];
    const previous = await tx.supplierCredential.findMany({
      where: { supplierId, kind: { in: [...kinds] }, status: 'VERIFIED' },
      select: { id: true, storageKey: true },
    });
    await tx.supplierCredential.updateMany({
      where: { id: { in: previous.map((row) => row.id) } },
      data: { status: 'SUPERSEDED', storageKey: null },
    });
    await this.recomputeExpiry(tx, supplierId);
    return previous;
  }

  /** V3a: the earliest expiry of the current documents, as dispatch reads it. */
  private async recomputeExpiry(
    tx: Prisma.TransactionClient,
    supplierId: string,
  ): Promise<void> {
    const versions = await tx.supplierCredential.findMany({
      where: { supplierId, status: 'VERIFIED' },
      select: { kind: true, status: true, expiresOn: true, uploadedAt: true },
    });
    await tx.supplierProfile.update({
      where: { id: supplierId },
      data: {
        credentialExpiresAt: currentCredentialExpiry(
          versions.map((version) => ({
            ...version,
            kind: version.kind as CredentialKind,
          })),
        ),
      },
    });
  }

  /** Best-effort: a file left behind is unreachable once its row has no key. */
  async removeFiles(keys: readonly (string | null)[]): Promise<void> {
    for (const key of keys) {
      if (key) await this.storage.delete(key).catch(() => undefined);
    }
  }

  private async tellWorker(primaryPhone: string, approved: boolean): Promise<void> {
    const phone = normalizeWorkerPhone(primaryPhone);
    if (!phone) return;
    try {
      await this.sms.send({ to: phone, body: credentialReviewSms(approved) });
    } catch (error) {
      // The review stands; the app shows the outcome whether or not the SMS left.
      this.logger.warn(`Credential review SMS failed: ${(error as Error).message}`);
    }
  }

  private toSlot(
    slot: CredentialSlot<VersionRow & { kind: CredentialKind }>,
    now: Date,
    windowDays: number,
  ): CredentialSlotDto {
    const expiresOn = slot.current?.expiresOn ?? null;
    return {
      kind: slot.kind,
      state: credentialState(slot.current, now, windowDays),
      pauseFrom: expiresOn ? dayString(credentialPauseFrom(expiresOn, windowDays)) : null,
      current: slot.current ? this.toVersion(slot.current) : null,
      pending: slot.pending ? this.toVersion(slot.pending) : null,
      rejected: slot.rejected ? this.toVersion(slot.rejected) : null,
    };
  }

  private toVersion(row: VersionRow): CredentialVersionDto {
    return {
      id: row.id,
      kind: row.kind as CredentialKind,
      status: row.status,
      number: row.number,
      issuer: row.issuer,
      issuedOn: dayString(row.issuedOn),
      expiresOn: dayString(row.expiresOn),
      uploadedAt: row.uploadedAt.toISOString(),
      uploadedVia: row.uploadedVia,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedByName: firstName(row.reviewedBy?.fullName),
      rejectReason: row.rejectReason,
      hasFile: row.storageKey !== null,
      contentType: contentTypeFromKey(row.storageKey),
    };
  }

  private async versions(
    supplierId: string,
  ): Promise<(VersionRow & { kind: CredentialKind })[]> {
    const rows = await this.prisma.supplierCredential.findMany({
      where: { supplierId, status: { not: 'SUPERSEDED' } },
      include: VERSION_INCLUDE,
      orderBy: { uploadedAt: 'asc' },
    });
    return rows.map((row) => ({ ...row, kind: row.kind as CredentialKind }));
  }

  private async version(supplierId: string, credentialId: string): Promise<VersionRow> {
    const version = await this.prisma.supplierCredential.findFirst({
      where: { id: credentialId, supplierId },
    });
    if (!version) {
      throw new NotFoundException(`Credential ${credentialId} not found`);
    }
    return version;
  }

  private async supplier(
    supplierId: string,
  ): Promise<{ id: string; category: string; primaryPhone: string }> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id: supplierId },
      select: { id: true, category: true, primaryPhone: true },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }
    return supplier;
  }

  private async workerProfile(actor: AuthUser) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        category: true,
        verificationStatus: true,
        vehicleDetails: true,
      },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }
    return profile;
  }

  private async windowDays(): Promise<number> {
    return (await this.settings.thresholds()).credentialExpiryWindowDays;
  }
}
