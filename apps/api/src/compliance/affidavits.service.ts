import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, TravelerAffidavit } from '@ota/db';
import {
  affidavitRetainUntil,
  isUsPerson,
  ofacGate,
  signatureMatches,
  type OfacCategory,
} from '@ota/domain';
import type {
  AffidavitExportQuery,
  AffidavitRecordDto,
  AffidavitSummaryDto,
  RecordPaperAffidavitRequest,
  ReservationOfacDto,
  SignAffidavitRequest,
} from '@ota/schemas';
import type { ObjectStorage } from '@ota/storage';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE } from '../storage/storage.module';
import { LegalTextsService, type ResolvedText } from './legal-texts.service';

const MAX_SCAN_BYTES = 10 * 1024 * 1024;

const SCAN_EXTENSIONS: Record<RecordPaperAffidavitRequest['contentType'], string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Who signed online: the request's address and browser, kept with the record (D5). */
export interface SigningClient {
  ipAddress: string | null;
  userAgent: string | null;
}

type RecordRow = Prisma.TravelerAffidavitGetPayload<{
  include: { recordedBy: { select: { email: true } } };
}>;

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toSummary(row: TravelerAffidavit): AffidavitSummaryDto {
  return {
    id: row.id,
    travelerId: row.travelerId,
    category: row.category,
    signerName: row.signerName,
    source: row.source,
    signedAt: row.signedAt.toISOString(),
    statementVersion: row.statementVersion,
    hasDocument: row.documentKey !== null,
  };
}

function toRecord(row: RecordRow): AffidavitRecordDto {
  return {
    ...toSummary(row),
    reservationId: row.reservationId,
    bookingCode: row.bookingCode,
    signerNationality: row.signerNationality,
    travelStart: day(row.travelStart),
    travelEnd: day(row.travelEnd),
    statementHash: row.statementHash,
    signature: row.signature,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    recordedByEmail: row.recordedBy?.email ?? null,
    supersedesId: row.supersedesId,
    retainUntil: row.retainUntil.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A CSV cell for free text: quoted when needed, and a leading = + - @ is
 * neutralised so a spreadsheet never runs a signer's name as a formula.
 */
function csvCell(value: string | null): string {
  const raw = value ?? '';
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * OFAC travel-category certifications (M3, D1–D3, D5): the status per
 * traveler, online signing by the booking's owner, paper affidavits recorded by
 * the desk, and the audited full record, scan and legal export. Records are
 * append-only; a new affidavit supersedes the traveler's previous one.
 */
@Injectable()
export class AffidavitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalTextsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Each traveler's position; for the owner, pass `ownerId` to scope the booking. */
  async status(
    reservationId: string,
    options: { ownerId?: string; locale?: string } = {},
  ): Promise<ReservationOfacDto> {
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id: reservationId,
        ...(options.ownerId ? { userId: options.ownerId } : {}),
      },
      include: {
        travelers: { orderBy: { position: 'asc' } },
        affidavits: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const gate = ofacGate(reservation.travelers, reservation.affidavits);
    const statement = this.legal.ofacStatement(options.locale);
    return {
      reservationId,
      missing: gate.missing.length,
      travelers: reservation.travelers.map((traveler) => {
        // Newest first, so the first match is the current affidavit.
        const current = reservation.affidavits.find(
          (affidavit) => affidavit.travelerId === traveler.id,
        );
        return {
          travelerId: traveler.id,
          fullName: traveler.fullName,
          required: gate.required.includes(traveler.id),
          affidavit: current ? toSummary(current) : null,
        };
      }),
      statement: statement ? { version: statement.version, text: statement.text } : null,
    };
  }

  /** The booking's owner certifies for one US traveler on it (T-Forms step 4). */
  async sign(
    actor: AuthUser,
    reservationId: string,
    travelerId: string,
    input: SignAffidavitRequest,
    client: SigningClient,
  ): Promise<AffidavitSummaryDto> {
    const { reservation, traveler, current } = await this.loadTraveler(
      reservationId,
      travelerId,
      actor.id,
    );
    const statement = this.requireStatement(input.locale);
    if (statement.version !== input.statementVersion) {
      throw new ConflictException(
        'The certification statement changed since it was shown; read it again and sign',
      );
    }
    if (!signatureMatches(input.signature, traveler.fullName)) {
      throw new BadRequestException(
        "The signature must be the traveler's full name as it appears on the booking",
      );
    }

    const affidavit = await this.prisma.$transaction((tx) =>
      this.createOnline(
        tx,
        actor.id,
        reservation,
        traveler,
        current,
        input,
        statement,
        client,
      ),
    );
    return toSummary(affidavit);
  }

  /**
   * Write an online certification in the caller's transaction, after the
   * caller has checked the statement version and the signature. The Booking
   * form signs as it books, so the booking and its records land together.
   */
  async createOnline(
    tx: Prisma.TransactionClient,
    actorId: string,
    reservation: { id: string; bookingCode: string; startDate: Date; endDate: Date },
    traveler: { id: string; fullName: string; nationality: string | null },
    current: TravelerAffidavit | null,
    input: { category: OfacCategory; signature: string },
    statement: ResolvedText,
    client: SigningClient,
  ): Promise<TravelerAffidavit> {
    const created = await tx.travelerAffidavit.create({
      data: {
        ...this.snapshot(reservation, traveler, current, statement, input.category),
        signature: input.signature,
        source: 'ONLINE',
        ipAddress: client.ipAddress,
        userAgent: client.userAgent?.slice(0, 500) ?? null,
        signedAt: new Date(),
      },
    });
    await this.audit(tx, actorId, 'affidavit.signed', reservation.id, {
      affidavitId: created.id,
      travelerId: traveler.id,
      category: input.category,
    });
    return created;
  }

  /** The desk records a signed paper form and keeps its scan (A-Customers). */
  async recordPaper(
    actor: AuthUser,
    reservationId: string,
    travelerId: string,
    input: RecordPaperAffidavitRequest,
  ): Promise<AffidavitSummaryDto> {
    const { reservation, traveler, current } = await this.loadTraveler(
      reservationId,
      travelerId,
    );
    const statement = this.requireStatement();
    const data = Buffer.from(input.contentBase64, 'base64');
    if (data.length === 0) {
      throw new BadRequestException('The scan is empty');
    }
    if (data.length > MAX_SCAN_BYTES) {
      throw new BadRequestException('The scan exceeds 10 MB');
    }

    const documentKey = `affidavits/${reservationId}/${randomUUID()}.${SCAN_EXTENSIONS[input.contentType]}`;
    await this.storage.put(documentKey, data, input.contentType);

    const affidavit = await this.prisma.$transaction(async (tx) => {
      const created = await tx.travelerAffidavit.create({
        data: {
          ...this.snapshot(reservation, traveler, current, statement, input.category),
          signerName: input.signerName,
          signature: input.signerName,
          source: 'PAPER',
          documentKey,
          recordedById: actor.id,
          signedAt: input.signedAt,
        },
      });
      await this.audit(tx, actor.id, 'affidavit.recorded', reservationId, {
        affidavitId: created.id,
        travelerId,
        category: input.category,
      });
      return created;
    });
    return toSummary(affidavit);
  }

  /** The full record, signature and IP included; the read is audited first. */
  async record(id: string, actor: AuthUser): Promise<AffidavitRecordDto> {
    const row = await this.prisma.travelerAffidavit.findUnique({
      where: { id },
      include: { recordedBy: { select: { email: true } } },
    });
    if (!row) {
      throw new NotFoundException(`Affidavit ${id} not found`);
    }
    await this.audit(this.prisma, actor.id, 'affidavit.viewed', row.reservationId, {
      affidavitId: id,
    });
    return toRecord(row);
  }

  /** The scanned paper form; the read is audited first. */
  async document(
    id: string,
    actor: AuthUser,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const row = await this.prisma.travelerAffidavit.findUnique({ where: { id } });
    if (!row?.documentKey) {
      throw new NotFoundException(`Affidavit ${id} has no scanned document`);
    }
    const object = await this.storage.get(row.documentKey);
    if (!object) {
      throw new NotFoundException('The scanned document is missing from storage');
    }
    await this.audit(
      this.prisma,
      actor.id,
      'affidavit.document_viewed',
      row.reservationId,
      {
        affidavitId: id,
      },
    );
    return { data: object.body, contentType: object.contentType || 'application/pdf' };
  }

  /** The legal export (Super Admin, on a legal request): every field, as CSV. */
  async export(query: AffidavitExportQuery, actor: AuthUser): Promise<string> {
    const rows = await this.prisma.travelerAffidavit.findMany({
      where: {
        signedAt: {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        },
      },
      orderBy: { signedAt: 'asc' },
    });

    const header = [
      'id',
      'booking_code',
      'signer_name',
      'signer_nationality',
      'category',
      'source',
      'signed_at',
      'travel_start',
      'travel_end',
      'statement_version',
      'statement_hash',
      'signature',
      'ip_address',
      'user_agent',
      'supersedes_id',
      'retain_until',
    ];
    const lines = rows.map((row) =>
      [
        row.id,
        row.bookingCode,
        row.signerName,
        row.signerNationality,
        row.category,
        row.source,
        row.signedAt.toISOString(),
        day(row.travelStart),
        day(row.travelEnd),
        row.statementVersion,
        row.statementHash,
        row.signature,
        row.ipAddress,
        row.userAgent,
        row.supersedesId,
        row.retainUntil.toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );

    await this.audit(this.prisma, actor.id, 'affidavit.exported', null, {
      count: rows.length,
      from: query.from?.toISOString() ?? null,
      to: query.to?.toISOString() ?? null,
    });
    return [header.join(','), ...lines].join('\n') + '\n';
  }

  private async loadTraveler(
    reservationId: string,
    travelerId: string,
    ownerId?: string,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, ...(ownerId ? { userId: ownerId } : {}) },
      include: {
        travelers: { where: { id: travelerId } },
        affidavits: { where: { travelerId }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const traveler = reservation?.travelers[0];
    if (!reservation || !traveler) {
      throw new NotFoundException(`Traveler ${travelerId} is not on this booking`);
    }
    if (!isUsPerson(traveler)) {
      throw new BadRequestException(
        'This traveler does not need a travel-category certification',
      );
    }
    return { reservation, traveler, current: reservation.affidavits[0] ?? null };
  }

  /** The OFAC statement in force; 503 while the tenant content has none. */
  requireStatement(locale?: string): ResolvedText {
    const statement = this.legal.ofacStatement(locale);
    if (!statement) {
      throw new ServiceUnavailableException(
        'The OFAC certification statement is not set in the tenant content',
      );
    }
    return statement;
  }

  /** What the record keeps of the booking and traveler, so it outlives them (D1, D6). */
  private snapshot(
    reservation: { id: string; bookingCode: string; startDate: Date; endDate: Date },
    traveler: { id: string; fullName: string; nationality: string | null },
    current: TravelerAffidavit | null,
    statement: ResolvedText,
    category: OfacCategory,
  ) {
    return {
      reservationId: reservation.id,
      travelerId: traveler.id,
      supersedesId: current?.id ?? null,
      category,
      signerName: traveler.fullName,
      signerNationality: traveler.nationality,
      bookingCode: reservation.bookingCode,
      travelStart: reservation.startDate,
      travelEnd: reservation.endDate,
      statementVersion: statement.version,
      statementHash: statement.hash,
      retainUntil: affidavitRetainUntil(reservation.endDate),
    };
  }

  private async audit(
    client: Pick<Prisma.TransactionClient, 'auditLog'>,
    actorUserId: string,
    action: string,
    reservationId: string | null,
    metadata: Record<string, string | number | null>,
  ): Promise<void> {
    // Booking-scoped where the record still has a booking, so the desk sees it there.
    await client.auditLog.create({
      data: {
        actorUserId,
        action,
        entityType: reservationId ? 'Reservation' : 'TravelerAffidavit',
        entityId: reservationId ?? (metadata.affidavitId as string | null) ?? null,
        metadata,
      },
    });
  }
}
