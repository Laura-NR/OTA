import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConsentRecord } from '@ota/db';
import { CONSENT_PURPOSES, currentConsents, needsConsent } from '@ota/domain';
import type { ConsentRecordDto, MyConsentDto, RecordConsentRequest } from '@ota/schemas';

import { PrismaService } from '../prisma/prisma.service';
import { LegalTextsService } from './legal-texts.service';

function toDto(row: ConsentRecord): ConsentRecordDto {
  return {
    id: row.id,
    purpose: row.purpose,
    granted: row.granted,
    textVersion: row.textVersion,
    source: row.source,
    locale: row.locale,
    region: row.region,
    reservationId: row.reservationId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The append-only consent log (M3, D4). A grant or withdrawal is a new row,
 * stamped with the version and hash of the words in force; a version the
 * traveler was not shown is refused, so a grant never covers unseen words.
 */
@Injectable()
export class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalTextsService,
  ) {}

  /** Every purpose with the traveler's current entry and the words in force now. */
  async mine(userId: string, locale?: string): Promise<MyConsentDto[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    const current = currentConsents(rows);

    return CONSENT_PURPOSES.map((purpose) => {
      const entry = current.get(purpose) ?? null;
      const text = this.legal.consent(purpose, locale);
      return {
        purpose,
        current: entry ? toDto(entry) : null,
        text: text ? { version: text.version, text: text.text } : null,
        needsConsent: text ? needsConsent(entry ?? undefined, text.version) : false,
      };
    });
  }

  async record(userId: string, input: RecordConsentRequest): Promise<ConsentRecordDto> {
    const text = this.legal.consent(input.purpose, input.locale);
    if (!text) {
      throw new UnprocessableEntityException(
        `The agency has no text for ${input.purpose} consent yet`,
      );
    }
    if (text.version !== input.textVersion) {
      throw new ConflictException(
        'These words changed since they were shown; reload and choose again',
      );
    }
    if (input.reservationId) {
      const owned = await this.prisma.reservation.findFirst({
        where: { id: input.reservationId, userId },
        select: { id: true },
      });
      if (!owned) {
        throw new NotFoundException(`Reservation ${input.reservationId} not found`);
      }
    }

    const row = await this.prisma.consentRecord.create({
      data: {
        userId,
        reservationId: input.reservationId ?? null,
        purpose: input.purpose,
        granted: input.granted,
        textVersion: text.version,
        textHash: text.hash,
        source: input.source,
        locale: input.locale ?? null,
      },
    });
    return toDto(row);
  }

  /** A customer's whole log, newest first (A-Customers "Consent log"). */
  async forCustomer(userId: string): Promise<ConsentRecordDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`Customer ${userId} not found`);
    }
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }
}
