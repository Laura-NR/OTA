import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentProof, Prisma } from '@ota/db';
import { addBusinessDays } from '@ota/domain';
import type {
  AcceptProofRequest,
  ProofQueueItemDto,
  ProofQueueQuery,
  ProofSummaryDto,
  ProofUploadRequest,
  RejectProofRequest,
} from '@ota/schemas';
import type { ObjectStorage } from '@ota/storage';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE } from '../storage/storage.module';

/** "Up to 10 MB" (Payment board). */
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<ProofUploadRequest['contentType'], string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
};

/** Proofs belong to transfers; a card payment is confirmed by its gateway. */
const TRANSFER_RAILS: readonly string[] = ['OPEN_BANKING_SEPA', 'OTHER'];

const QUEUE_INCLUDE = {
  receipt: {
    include: {
      reservation: { select: { bookingCode: true } },
      instalment: { select: { kind: true, dueAt: true, status: true } },
    },
  },
  uploadedBy: { select: { email: true } },
};

type QueueRow = Prisma.PaymentProofGetPayload<{ include: typeof QUEUE_INCLUDE }>;

function contentTypeOf(key: string): string {
  return (
    CONTENT_TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
  );
}

export function toProofSummary(row: PaymentProof): ProofSummaryDto {
  return {
    id: row.id,
    receiptId: row.receiptId,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

function toQueueItem(row: QueueRow): ProofQueueItemDto {
  return {
    ...toProofSummary(row),
    reservationId: row.receipt.reservationId,
    bookingCode: row.receipt.reservation.bookingCode,
    rail: row.receipt.rail,
    amount: row.receipt.amount.toFixed(2),
    currency: row.receipt.currency,
    receiptStatus: row.receipt.status,
    instalmentKind: row.receipt.instalment?.kind ?? null,
    dueAt: row.receipt.instalment ? row.receipt.instalment.dueAt.toISOString() : null,
    contentType: contentTypeOf(row.storageKey),
    uploadedByEmail: row.uploadedBy?.email ?? null,
  };
}

/**
 * Proofs of transfer (M4 D5): the traveler uploads one for a pending bank
 * transfer; the desk reviews it. Accepting extends the instalment's window by
 * one business day; the payment is still confirmed by hand once the money is
 * seen. Files sit behind `packages/storage` and are read through an audited
 * route, never a public URL.
 */
@Injectable()
export class ProofsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async upload(
    actor: AuthUser,
    reservationId: string,
    receiptId: string,
    input: ProofUploadRequest,
  ): Promise<ProofSummaryDto> {
    const receipt = await this.prisma.paymentReceipt.findFirst({
      where: { id: receiptId, reservationId, reservation: { userId: actor.id } },
    });
    if (!receipt) {
      throw new NotFoundException(`Payment ${receiptId} not found for this booking`);
    }
    if (!TRANSFER_RAILS.includes(receipt.rail)) {
      throw new ConflictException('A proof of transfer is only for a bank transfer');
    }
    if (receipt.status !== 'PENDING') {
      throw new ConflictException(`This payment is already ${receipt.status}`);
    }

    const data = Buffer.from(input.contentBase64, 'base64');
    if (data.length === 0) {
      throw new BadRequestException('The file is empty');
    }
    if (data.length > MAX_PROOF_BYTES) {
      throw new BadRequestException('The file exceeds 10 MB');
    }

    const key = `payment-proofs/${reservationId}/${randomUUID()}.${EXTENSIONS[input.contentType]}`;
    await this.storage.put(key, data, input.contentType);

    const proof = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentProof.create({
        data: { receiptId, storageKey: key, uploadedById: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'payment.proof_uploaded',
          entityType: 'Reservation',
          entityId: reservationId,
          metadata: { proofId: created.id, receiptId },
        },
      });
      return created;
    });
    return toProofSummary(proof);
  }

  /** The A-Payments queue, oldest first; submitted proofs unless a status is asked. */
  async queue(query: ProofQueueQuery): Promise<ProofQueueItemDto[]> {
    const rows = await this.prisma.paymentProof.findMany({
      where: { status: query.status ?? 'SUBMITTED' },
      orderBy: { createdAt: 'asc' },
      take: query.limit,
      include: QUEUE_INCLUDE,
    });
    return rows.map(toQueueItem);
  }

  /** Stream a proof's file; the read is audited (it shows bank details). */
  async file(
    id: string,
    actor: AuthUser,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const proof = await this.prisma.paymentProof.findUnique({
      where: { id },
      include: { receipt: { select: { reservationId: true } } },
    });
    if (!proof) {
      throw new NotFoundException(`Proof ${id} not found`);
    }
    const object = await this.storage.get(proof.storageKey);
    if (!object) {
      throw new NotFoundException('The proof file is missing from storage');
    }
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'payment.proof_viewed',
        entityType: 'Reservation',
        entityId: proof.receipt.reservationId,
        metadata: { proofId: id },
      },
    });
    return {
      data: object.body,
      contentType: object.contentType || contentTypeOf(proof.storageKey),
    };
  }

  async accept(
    id: string,
    input: AcceptProofRequest,
    actor: AuthUser,
  ): Promise<ProofQueueItemDto> {
    const proof = await this.requireSubmitted(id);
    const instalment = proof.receipt.instalment;
    // The money may take a business day to land: the window waits for it.
    const extendedTo =
      instalment?.status === 'DUE'
        ? addBusinessDays(new Date(Math.max(Date.now(), instalment.dueAt.getTime())), 1)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentProof.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: input.note ?? null,
        },
      });
      if (extendedTo && proof.receipt.instalmentId) {
        await tx.paymentInstalment.update({
          where: { id: proof.receipt.instalmentId },
          data: { dueAt: extendedTo },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'payment.proof_accepted',
          entityType: 'Reservation',
          entityId: proof.receipt.reservationId,
          metadata: {
            proofId: id,
            windowExtendedTo: extendedTo ? extendedTo.toISOString() : null,
          },
        },
      });
    });
    return this.queueItem(id);
  }

  async reject(
    id: string,
    input: RejectProofRequest,
    actor: AuthUser,
  ): Promise<ProofQueueItemDto> {
    const proof = await this.requireSubmitted(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentProof.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: input.note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'payment.proof_rejected',
          entityType: 'Reservation',
          entityId: proof.receipt.reservationId,
          metadata: { proofId: id },
        },
      });
    });
    return this.queueItem(id);
  }

  private async requireSubmitted(id: string): Promise<QueueRow> {
    const proof = await this.prisma.paymentProof.findUnique({
      where: { id },
      include: QUEUE_INCLUDE,
    });
    if (!proof) {
      throw new NotFoundException(`Proof ${id} not found`);
    }
    if (proof.status !== 'SUBMITTED') {
      throw new ConflictException(`This proof was already ${proof.status}`);
    }
    return proof;
  }

  private async queueItem(id: string): Promise<ProofQueueItemDto> {
    const row = await this.prisma.paymentProof.findUniqueOrThrow({
      where: { id },
      include: QUEUE_INCLUDE,
    });
    return toQueueItem(row);
  }
}
