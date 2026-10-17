import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import {
  ReservationStatus,
  ServiceType,
  proposalCanAccept,
  proposalEffectiveStatus,
  proposalLineAmount,
  proposalPartySize,
  proposalPerPerson,
  proposalToPriceLineKind,
  proposalTotal,
  type ProposalStatus,
} from '@ota/domain';
import { renderProposalHtml } from '@ota/documents';
import { proposalSentEmail, type EmailAttachment, type Mailer } from '@ota/email';
import {
  proposalDocumentSchema,
  proposalRequestPayloadDtoSchema,
  type AcceptProposalResultDto,
  type CreateCustomRequestRequest,
  type CreateCustomRequestResultDto,
  type CreateProposalVersionRequest,
  type DeclineProposalRequest,
  type ProposalDocument,
  type ProposalDto,
  type ProposalListItemDto,
  type ProposalQueueQuery,
  type ProposalRequestDto,
  type ProposalVersionDto,
} from '@ota/schemas';
import type { ObjectStorage } from '@ota/storage';

import type { AuthUser } from '../common/auth/auth-user';
import { generateBookingCode } from '../common/booking-code';
import { accountProposalUrl } from '../common/storefront-url';
import { DOCUMENT_RENDERER, type DocumentRenderer } from '../documents/document-renderer';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE } from '../storage/storage.module';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

const PROPOSAL_INCLUDE = {
  request: {
    include: { user: { select: { email: true, fullName: true, locale: true } } },
  },
  versions: {
    orderBy: { version: 'desc' as const },
    include: { priceLines: { orderBy: { position: 'asc' as const } } },
  },
  reservation: { select: { id: true, bookingCode: true } },
} satisfies Prisma.ProposalInclude;

type ProposalRow = Prisma.ProposalGetPayload<{ include: typeof PROPOSAL_INCLUDE }>;

const DAY_MS = 86_400_000;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function endOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function toRequestDto(row: ProposalRow['request']): ProposalRequestDto {
  const payload = row.payload as Record<string, unknown>;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    payload: proposalRequestPayloadDtoSchema.parse({
      startDate: payload.startDate,
      endDate: payload.endDate,
      adults: payload.adults ?? 1,
      children: payload.children ?? 0,
      inventoryItemIds: Array.isArray(payload.inventoryItemIds)
        ? payload.inventoryItemIds
        : [],
      nationality: payload.nationality ?? null,
      budgetPerPerson: payload.budgetPerPerson ?? null,
      interests: Array.isArray(payload.interests) ? payload.interests : [],
      pace: payload.pace ?? null,
    }),
    notes: row.notes,
    locale: row.locale,
    createdAt: row.createdAt.toISOString(),
  };
}

function toVersionDto(row: ProposalRow['versions'][number]): ProposalVersionDto {
  return {
    id: row.id,
    version: row.version,
    currency: row.currency,
    total: row.total.toFixed(2),
    perPerson: row.perPerson ? row.perPerson.toFixed(2) : null,
    validUntil: row.validUntil.toISOString(),
    document: proposalDocumentSchema.parse(row.document),
    terms: (row.terms as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    hasPdf: row.pdfKey !== null,
    lines: row.priceLines.map((line) => ({
      id: line.id,
      kind: line.kind,
      unit: line.unit,
      label: line.label,
      description: line.description,
      quantity: line.quantity.toFixed(2),
      unitAmount: line.unitAmount.toFixed(2),
      amount: line.amount.toFixed(2),
      currency: line.currency,
      position: line.position,
      serviceType: line.serviceType,
      province: line.province,
      serviceDateStart: iso(line.serviceDateStart),
      serviceDateEnd: iso(line.serviceDateEnd),
      inventoryItemId: line.inventoryItemId,
    })),
  };
}

function effectiveStatus(row: ProposalRow, now: Date): ProposalStatus {
  const current = row.versions[0];
  return current
    ? proposalEffectiveStatus(row.status, current.validUntil, now)
    : (row.status as ProposalStatus);
}

function toProposalDto(row: ProposalRow, now: Date): ProposalDto {
  return {
    id: row.id,
    requestId: row.requestId,
    reference: row.request.reference,
    status: effectiveStatus(row, now),
    currentVersion: row.currentVersion,
    acceptedVersionId: row.acceptedVersionId,
    reservationId: row.reservationId,
    reservationCode: row.reservation?.bookingCode ?? null,
    sentAt: iso(row.sentAt),
    acceptedAt: iso(row.acceptedAt),
    declinedAt: iso(row.declinedAt),
    declineReason: row.declineReason,
    createdAt: row.createdAt.toISOString(),
    customerEmail: row.request.user.email,
    customerName: row.request.user.fullName,
    request: toRequestDto(row.request),
    versions: row.versions.map(toVersionDto),
  };
}

function toListItem(row: ProposalRow, now: Date): ProposalListItemDto {
  const current = row.versions[0];
  return {
    id: row.id,
    reference: row.request.reference,
    status: effectiveStatus(row, now),
    requestId: row.requestId,
    customerEmail: row.request.user.email,
    customerName: row.request.user.fullName,
    startDate: String((row.request.payload as Record<string, unknown>).startDate),
    endDate: String((row.request.payload as Record<string, unknown>).endDate),
    adults: Number((row.request.payload as Record<string, unknown>).adults ?? 1),
    children: Number((row.request.payload as Record<string, unknown>).children ?? 0),
    currentVersion: row.currentVersion,
    total: current ? current.total.toFixed(2) : null,
    currency: current?.currency ?? null,
    validUntil: current ? current.validUntil.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * M5 custom-trip proposals (`docs/schema-m5-proposal.md`): the builder's
 * request, the desk's immutable priced versions, the traveler's acceptance and
 * the booking it creates. Nothing is charged by a proposal.
 */
@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async createRequest(
    actor: AuthUser,
    input: CreateCustomRequestRequest,
  ): Promise<CreateCustomRequestResultDto> {
    const ids = [...new Set(input.inventoryItemIds)];
    if (ids.length > 0) {
      const found = await this.prisma.inventoryItem.count({
        where: { id: { in: ids }, active: true },
      });
      if (found !== ids.length) {
        throw new NotFoundException('One or more catalog items are unavailable');
      }
    }

    const payload: Prisma.InputJsonValue = {
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
      adults: input.adults,
      children: input.children,
      inventoryItemIds: ids,
      nationality: input.nationality ?? null,
      budgetPerPerson: input.budgetPerPerson ?? null,
      interests: input.interests,
      pace: input.pace ?? null,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = `VX-C-${generateBookingCode()}`;
      const clash = await this.prisma.customRequest.findUnique({
        where: { reference },
        select: { id: true },
      });
      if (clash) {
        continue;
      }

      try {
        return await this.prisma.$transaction(async (tx) => {
          const request = await tx.customRequest.create({
            data: {
              userId: actor.id,
              reference,
              locale: input.locale ?? null,
              payload,
              notes: input.notes ?? null,
            },
          });
          const proposal = await tx.proposal.create({
            data: { requestId: request.id },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'custom_request.created',
              entityType: 'CustomRequest',
              entityId: request.id,
              metadata: {
                reference,
                adults: input.adults,
                children: input.children,
                inventoryItemCount: ids.length,
              },
            },
          });
          return { id: proposal.id, requestId: request.id, reference };
        });
      } catch (error) {
        // A reference race is retried; anything else is the caller's error.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Could not allocate a unique proposal reference');
  }

  async listForUser(userId: string): Promise<ProposalListItemDto[]> {
    const now = new Date();
    const rows = await this.prisma.proposal.findMany({
      where: { request: { userId } },
      include: PROPOSAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => toListItem(row, now));
  }

  async getForUser(userId: string, id: string): Promise<ProposalDto> {
    const row = await this.prisma.proposal.findFirst({
      where: { id, request: { userId } },
      include: PROPOSAL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Proposal ${id} not found`);
    }
    return toProposalDto(row, new Date());
  }

  async listForOps(query: ProposalQueueQuery): Promise<ProposalListItemDto[]> {
    const now = new Date();
    const rows = await this.prisma.proposal.findMany({
      where: query.status === 'EXPIRED' ? {} : { status: query.status },
      include: PROPOSAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: query.status === 'EXPIRED' ? 200 : query.limit,
    });
    const items = rows.map((row) => toListItem(row, now));
    return query.status === 'EXPIRED'
      ? items.filter((item) => item.status === 'EXPIRED').slice(0, query.limit)
      : items;
  }

  async getForOps(id: string): Promise<ProposalDto> {
    const row = await this.prisma.proposal.findUnique({
      where: { id },
      include: PROPOSAL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Proposal ${id} not found`);
    }
    return toProposalDto(row, new Date());
  }

  /**
   * Price a request: create the next immutable version, snapshot the terms,
   * send it and mark the proposal SENT. A revision is another version; the
   * previous one stays readable but cannot be accepted.
   */
  async createVersion(
    actor: AuthUser,
    proposalId: string,
    input: CreateProposalVersionRequest,
  ): Promise<ProposalDto> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        request: {
          include: { user: { select: { email: true, fullName: true, locale: true } } },
        },
        versions: {
          select: { version: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }
    if (proposal.status === 'ACCEPTED' || proposal.status === 'DECLINED') {
      throw new ConflictException(`The proposal is already ${proposal.status}`);
    }
    if (proposal.request.status !== 'OPEN') {
      throw new ConflictException('The request is no longer open');
    }

    const lineItemIds = [
      ...new Set(
        input.lines
          .map((line) => line.inventoryItemId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (lineItemIds.length > 0) {
      const found = await this.prisma.inventoryItem.count({
        where: { id: { in: lineItemIds }, active: true },
      });
      if (found !== lineItemIds.length) {
        throw new BadRequestException('One or more line items are unavailable');
      }
    }

    const version = proposal.currentVersion + 1;
    const validUntil = input.validUntil
      ? endOfUtcDay(input.validUntil)
      : new Date(Date.now() + this.tenant.proposals.validityDays * DAY_MS);
    const lines = input.lines.map((line, position) => ({
      kind: line.kind,
      unit: line.unit,
      label: line.label,
      description: line.description ?? null,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      amount: proposalLineAmount(line.quantity, line.unitAmount),
      currency: input.currency,
      position,
      serviceType: line.serviceType ?? null,
      province: line.province ?? null,
      serviceDateStart: line.serviceDateStart ?? null,
      serviceDateEnd: line.serviceDateEnd ?? null,
      inventoryItemId: line.inventoryItemId ?? null,
    }));
    const total = proposalTotal(lines);
    const rawPayload = proposal.request.payload as Record<string, unknown>;
    const partySize = proposalPartySize(
      Number(rawPayload.adults ?? 1),
      Number(rawPayload.children ?? 0),
    );
    const document = proposalDocumentSchema.parse({
      summary: input.summary,
      startDate: String(rawPayload.startDate),
      endDate: String(rawPayload.endDate),
      adults: Number(rawPayload.adults ?? 1),
      children: Number(rawPayload.children ?? 0),
      stops: input.stops,
      days: input.days,
      options: input.options,
      ...(input.notes ? { notes: input.notes } : {}),
    });
    const terms = {
      depositPolicy: this.tenant.proposals.defaultDepositPolicy,
      cancellationPolicy: this.tenant.proposals.defaultCancellationPolicy,
      planningFee: this.tenant.proposals.planningFee,
      validityDays: this.tenant.proposals.validityDays,
      responseHours: this.tenant.proposals.responseHours,
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.proposalVersion.create({
        data: {
          proposalId,
          version,
          currency: input.currency,
          total,
          perPerson: proposalPerPerson(total, partySize),
          validUntil,
          document,
          terms,
          createdById: actor.id,
          priceLines: { create: lines },
        },
      });
      await tx.proposal.update({
        where: { id: proposalId },
        data: {
          status: 'SENT',
          currentVersion: version,
          sentAt: new Date(),
          assignedToId: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'proposal.sent',
          entityType: 'Proposal',
          entityId: proposalId,
          metadata: {
            version,
            total: total.toFixed(2),
            lineCount: lines.length,
            validUntil: validUntil.toISOString(),
          },
        },
      });
      return saved;
    });

    const locale = proposal.request.locale ?? proposal.request.user.locale;
    const portalUrl = accountProposalUrl(this.tenant, locale, proposalId);
    const travelerName = proposal.request.user.fullName ?? proposal.request.user.email;
    const pdf = await this.storeVersionPdf({
      versionId: created.id,
      proposalId,
      reference: proposal.request.reference,
      version,
      travelerName,
      createdAt: created.createdAt,
      validUntil,
      document,
      lines,
      currency: input.currency,
      total,
      perPerson: created.perPerson ? created.perPerson.toFixed(2) : null,
      portalUrl,
      locale,
    });
    try {
      await this.mailer.send(
        proposalSentEmail({
          to: proposal.request.user.email,
          name: travelerName,
          reference: proposal.request.reference,
          summary: document.summary,
          total,
          currency: input.currency,
          validUntil,
          portalUrl,
          locale,
          branding: this.tenant.branding,
          pdf,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Proposal email failed for ${proposal.request.reference} v${created.version}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return this.getForOps(proposalId);
  }

  /**
   * Render the version as the D-Proposal PDF, store it under `pdfKey` and
   * return it for the email. Best-effort, like the booking documents: a
   * renderer or storage failure is logged and the version is still sent,
   * without a PDF.
   */
  private async storeVersionPdf(input: {
    versionId: string;
    proposalId: string;
    reference: string;
    version: number;
    travelerName: string;
    createdAt: Date;
    validUntil: Date;
    document: ProposalDocument;
    lines: {
      label: string;
      description: string | null;
      quantity: number;
      amount: number;
    }[];
    currency: string;
    total: number;
    perPerson: string | null;
    portalUrl: string;
    locale: string | null;
  }): Promise<EmailAttachment | null> {
    try {
      const html = renderProposalHtml(
        {
          reference: input.reference,
          version: input.version,
          travelerName: input.travelerName,
          createdAt: input.createdAt.toISOString(),
          validUntil: input.validUntil.toISOString(),
          startDate: input.document.startDate,
          endDate: input.document.endDate,
          adults: input.document.adults,
          children: input.document.children,
          summary: input.document.summary,
          notes: input.document.notes ?? null,
          stops: input.document.stops,
          days: input.document.days,
          options: input.document.options,
          lines: input.lines.map((line) => ({
            label: line.label,
            description: line.description,
            quantity: line.quantity.toFixed(2),
            amount: line.amount.toFixed(2),
          })),
          currency: input.currency,
          total: input.total.toFixed(2),
          perPerson: input.perPerson,
          planningFee: this.tenant.proposals.planningFee,
          portalUrl: input.portalUrl,
        },
        {
          agencyName: this.tenant.branding.agencyName,
          licenseNumber: this.tenant.branding.licenseNumber,
          primaryColor: this.tenant.branding.primaryColor,
          supportEmail: this.tenant.branding.supportEmail,
          supportPhone: this.tenant.branding.supportPhone,
          emergencyContacts: this.tenant.emergencyContacts,
        },
        input.locale,
      );
      const bytes = await this.renderer.render(html);
      const key = `proposals/${input.proposalId}/v${input.version}.pdf`;
      await this.storage.put(key, bytes, 'application/pdf');
      await this.prisma.proposalVersion.update({
        where: { id: input.versionId },
        data: { pdfKey: key },
      });
      return {
        filename: `${input.reference}-v${input.version}.pdf`,
        content: Buffer.from(bytes),
        contentType: 'application/pdf',
      };
    } catch (error) {
      this.logger.warn(
        `Proposal PDF failed for ${input.reference} v${input.version}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  /** A version's PDF for the traveler who made the request. */
  async pdfForUser(
    userId: string,
    proposalId: string,
    versionId: string,
  ): Promise<{ body: Uint8Array; filename: string }> {
    return this.versionPdf(proposalId, versionId, userId);
  }

  /** A version's PDF for the desk. */
  async pdfForOps(
    proposalId: string,
    versionId: string,
  ): Promise<{ body: Uint8Array; filename: string }> {
    return this.versionPdf(proposalId, versionId, null);
  }

  private async versionPdf(
    proposalId: string,
    versionId: string,
    ownerId: string | null,
  ): Promise<{ body: Uint8Array; filename: string }> {
    const version = await this.prisma.proposalVersion.findFirst({
      where: {
        id: versionId,
        proposalId,
        ...(ownerId ? { proposal: { request: { userId: ownerId } } } : {}),
      },
      select: {
        version: true,
        pdfKey: true,
        proposal: { select: { request: { select: { reference: true } } } },
      },
    });
    if (!version?.pdfKey) {
      throw new NotFoundException('No PDF for this proposal version');
    }
    const stored = await this.storage.get(version.pdfKey);
    if (!stored) {
      throw new NotFoundException('No PDF for this proposal version');
    }
    return {
      body: stored.body,
      filename: `${version.proposal.request.reference}-v${version.version}.pdf`,
    };
  }

  /**
   * Accept the current version: create the booking request in one transaction
   * and copy the accepted lines. Nothing is charged; the desk dispatches next.
   */
  async acceptForUser(
    actor: AuthUser,
    proposalId: string,
    versionId: string,
  ): Promise<AcceptProposalResultDto> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id: proposalId, request: { userId: actor.id } },
      include: {
        request: true,
        versions: {
          include: { priceLines: { orderBy: { position: 'asc' } } },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }
    if (proposal.status === 'ACCEPTED' && proposal.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: proposal.reservationId },
        select: { id: true, bookingCode: true },
      });
      if (reservation) {
        return { reservationId: reservation.id, bookingCode: reservation.bookingCode };
      }
    }
    if (proposal.status !== 'SENT') {
      throw new ConflictException(`The proposal is ${proposal.status}`);
    }
    const current = proposal.versions[0];
    if (!current || current.id !== versionId) {
      throw new ConflictException('That version is no longer current');
    }
    if (!proposalCanAccept(proposal.status, current.validUntil, new Date())) {
      throw new ConflictException('The proposal has expired');
    }

    const rawPayload = proposal.request.payload as Record<string, unknown>;
    const startDate = new Date(String(rawPayload.startDate));
    const endDate = new Date(String(rawPayload.endDate));
    const itemIds = Array.isArray(rawPayload.inventoryItemIds)
      ? (rawPayload.inventoryItemIds as string[])
      : [];
    const adults = Number(rawPayload.adults ?? 1);
    const children = Number(rawPayload.children ?? 0);
    const partySize = proposalPartySize(adults, children);
    const now = new Date();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bookingCode = generateBookingCode();
      const clash = await this.prisma.reservation.findUnique({
        where: { bookingCode },
        select: { id: true },
      });
      if (clash) {
        continue;
      }

      try {
        return await this.prisma.$transaction(async (tx) => {
          const items =
            itemIds.length > 0
              ? await tx.inventoryItem.findMany({
                  where: { id: { in: itemIds }, active: true },
                })
              : [];
          const reservation = await tx.reservation.create({
            data: {
              userId: actor.id,
              bookingCode,
              startDate,
              endDate,
              status: ReservationStatus.ItinerarySubmitted,
              totalCurrency: current.currency,
              totalAmount: current.total,
              partySize,
              customItineraryPayload: {
                requestId: proposal.requestId,
                proposalId: proposal.id,
                proposalVersionId: current.id,
              },
              serviceItems: {
                create: items.map((item) => ({
                  serviceType: this.serviceTypeFor(item.type),
                  serviceDateStart: startDate,
                  serviceDateEnd: endDate,
                  province: item.province,
                  status: 'UNASSIGNED' as const,
                  payoutRate: 0,
                  travelerPrice: null,
                })),
              },
              priceLines: {
                create: current.priceLines.map((line) => ({
                  kind: proposalToPriceLineKind(line.kind),
                  label: line.label,
                  quantity: line.quantity,
                  unitAmount: line.unitAmount,
                  amount: line.amount,
                  currency: line.currency,
                  position: line.position,
                })),
              },
            },
          });

          const claimed = await tx.proposal.updateMany({
            where: { id: proposal.id, status: 'SENT', acceptedVersionId: null },
            data: {
              status: 'ACCEPTED',
              acceptedVersionId: current.id,
              acceptedAt: now,
              reservationId: reservation.id,
            },
          });
          if (claimed.count !== 1) {
            throw new ConflictException('The proposal was already accepted');
          }
          await tx.customRequest.update({
            where: { id: proposal.requestId },
            data: { status: 'CONVERTED' },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'proposal.accepted',
              entityType: 'Proposal',
              entityId: proposal.id,
              metadata: {
                versionId: current.id,
                reservationId: reservation.id,
                bookingCode,
                total: current.total.toFixed(2),
              },
            },
          });
          return { reservationId: reservation.id, bookingCode };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Could not allocate a unique booking code');
  }

  async declineForUser(
    actor: AuthUser,
    proposalId: string,
    input: DeclineProposalRequest,
  ): Promise<ProposalDto> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id: proposalId, request: { userId: actor.id } },
    });
    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }
    if (proposal.status !== 'SENT') {
      throw new ConflictException(`The proposal is ${proposal.status}`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.proposal.update({
        where: { id: proposalId },
        data: {
          status: 'DECLINED',
          declinedAt: new Date(),
          declineReason: input.reason ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'proposal.declined',
          entityType: 'Proposal',
          entityId: proposalId,
          metadata: { reason: input.reason ?? null },
        },
      });
    });
    return this.getForUser(actor.id, proposalId);
  }

  private serviceTypeFor(type: string): ServiceType {
    if (type === 'ACCOMMODATION') return ServiceType.Accommodation;
    if (type === 'TRANSPORT') return ServiceType.Transportation;
    return ServiceType.Experience;
  }
}
