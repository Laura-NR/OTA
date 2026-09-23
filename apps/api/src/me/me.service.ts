import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InventoryType, Prisma } from '@ota/db';
import { ReservationStatus, ServiceType } from '@ota/domain';
import type {
  CreateMyReservationRequest,
  CreatePackageBookingRequest,
  CreatePaymentIntentRequest,
  MeProfileDto,
  MyDocumentDto,
  MyReservationDetailDto,
  MyReservationListItemDto,
  PaymentIntentDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { generateBookingCode } from '../common/booking-code';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';

/** Catalog types map onto the dispatch service types (inventory has no GUIDE). */
const INVENTORY_TO_SERVICE: Record<InventoryType, ServiceType> = {
  ACCOMMODATION: ServiceType.Accommodation,
  TRANSPORT: ServiceType.Transportation,
  EXPERIENCE: ServiceType.Experience,
};

type ListRow = Prisma.ReservationGetPayload<{
  include: { _count: { select: { serviceItems: true; documents: true } } };
}>;

type DetailRow = Prisma.ReservationGetPayload<{
  include: {
    serviceItems: true;
    documents: true;
    _count: { select: { serviceItems: true; documents: true } };
  };
}>;

function toListDto(row: ListRow): MyReservationListItemDto {
  return {
    id: row.id,
    bookingCode: row.bookingCode,
    status: row.status as ReservationStatus,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    totalCurrency: row.totalCurrency,
    totalAmount: row.totalAmount.toString(),
    serviceItemCount: row._count.serviceItems,
    documentCount: row._count.documents,
  };
}

function toDetailDto(row: DetailRow): MyReservationDetailDto {
  return {
    ...toListDto(row),
    serviceItems: row.serviceItems.map((item) => ({
      id: item.id,
      serviceType: item.serviceType,
      status: item.status,
      province: item.province,
      serviceDateStart: item.serviceDateStart.toISOString(),
      serviceDateEnd: item.serviceDateEnd.toISOString(),
      supplierId: item.supplierId,
    })),
    documents: row.documents.map((document): MyDocumentDto => ({
      id: document.id,
      type: document.type,
      generatedAt: document.generatedAt.toISOString(),
    })),
  };
}

interface SubmissionServiceItem {
  serviceType: ServiceType;
  serviceDateStart: Date;
  serviceDateEnd: Date;
  province: string | null;
}

interface SubmissionParams {
  startDate: Date;
  endDate: Date;
  totalCurrency: string;
  totalAmount: number;
  customItineraryPayload: Prisma.InputJsonValue;
  serviceItems: SubmissionServiceItem[];
  auditMetadata?: Record<string, unknown>;
  packageId?: string;
  nationality?: string;
}

/**
 * The signed-in user's own records for the storefront self-service dashboard.
 * Every query is scoped to the caller — a traveler can never read another
 * traveler's booking.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async getProfile(userId: string): Promise<MeProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      locale: user.locale,
    };
  }

  async listReservations(userId: string): Promise<MyReservationListItemDto[]> {
    const rows = await this.prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { serviceItems: true, documents: true } } },
    });
    return rows.map(toListDto);
  }

  async getReservation(userId: string, id: string): Promise<MyReservationDetailDto> {
    const row = await this.prisma.reservation.findFirst({
      where: { id, userId },
      include: {
        serviceItems: { orderBy: { serviceDateStart: 'asc' } },
        documents: { orderBy: { generatedAt: 'desc' } },
        _count: { select: { serviceItems: true, documents: true } },
      },
    });
    if (!row) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }
    return toDetailDto(row);
  }

  /**
   * Build an itinerary from catalog items (spec §4.2 dynamic package builder)
   * and land it at ITINERARY_SUBMITTED for the caller. Service type, province,
   * and price come from the catalog item, never the client. Dispatch is a
   * separate operations action, so the booking is not auto-dispatched here.
   */
  async createReservation(
    userId: string,
    input: CreateMyReservationRequest,
  ): Promise<MyReservationDetailDto> {
    if (input.endDate < input.startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const ids = [...new Set(input.serviceItems.map((item) => item.inventoryItemId))];
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: ids }, active: true },
    });
    if (items.length !== ids.length) {
      throw new BadRequestException('One or more catalog items are unavailable');
    }
    const byId = new Map(items.map((item) => [item.id, item]));

    const totalAmount = items.reduce((sum, item) => sum + Number(item.basePrice), 0);
    const currency = items[0]?.currency ?? 'EUR';

    const createdId = await this.createSubmission(userId, {
      startDate: input.startDate,
      endDate: input.endDate,
      totalCurrency: currency,
      totalAmount,
      customItineraryPayload: { notes: input.notes ?? null, inventoryItemIds: ids },
      nationality: input.nationality,
      serviceItems: input.serviceItems.map((selection) => {
        const item = byId.get(selection.inventoryItemId)!;
        return {
          serviceType: INVENTORY_TO_SERVICE[item.type],
          serviceDateStart: selection.serviceDateStart ?? input.startDate,
          serviceDateEnd: selection.serviceDateEnd ?? input.endDate,
          province: item.province,
        };
      }),
    });

    return this.getReservation(userId, createdId);
  }

  /**
   * Book a curated package (spec §3.3): expand its itinerary into service items
   * and land the booking at ITINERARY_SUBMITTED. Price, service type, and
   * province come from the package and catalog, never the client.
   */
  async createPackageReservation(
    userId: string,
    input: CreatePackageBookingRequest,
  ): Promise<MyReservationDetailDto> {
    if (input.endDate < input.startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const pkg = await this.prisma.package.findUnique({
      where: { id: input.packageId },
      include: {
        services: {
          include: { inventoryItem: true },
          orderBy: [{ dayOffset: 'asc' }, { position: 'asc' }],
        },
      },
    });
    if (!pkg || !pkg.active) {
      throw new NotFoundException(`Package ${input.packageId} not found`);
    }

    const serviceItems: SubmissionServiceItem[] = pkg.services.map((service) => {
      const serviceDate = new Date(input.startDate);
      serviceDate.setUTCDate(serviceDate.getUTCDate() + service.dayOffset);
      return {
        serviceType: INVENTORY_TO_SERVICE[service.inventoryItem.type],
        serviceDateStart: serviceDate,
        serviceDateEnd: serviceDate,
        province: service.inventoryItem.province,
      };
    });

    const createdId = await this.createSubmission(userId, {
      startDate: input.startDate,
      endDate: input.endDate,
      totalCurrency: pkg.currency,
      totalAmount: Number(pkg.basePrice),
      customItineraryPayload: { packageId: pkg.id, packageSlug: pkg.slug },
      packageId: pkg.id,
      nationality: input.nationality,
      serviceItems,
      auditMetadata: { packageId: pkg.id, packageSlug: pkg.slug },
    });

    return this.getReservation(userId, createdId);
  }

  /**
   * Shared submission path for both the dynamic builder and curated packages:
   * allocate a unique booking code, persist the reservation and its service
   * items atomically, record the audit entry, and stamp the traveler's
   * nationality when supplied.
   */
  private async createSubmission(
    userId: string,
    params: SubmissionParams,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bookingCode = generateBookingCode();
      const clash = await this.prisma.reservation.findUnique({
        where: { bookingCode },
        select: { id: true },
      });
      if (clash) {
        continue;
      }

      return this.prisma.$transaction(async (tx) => {
        if (params.nationality) {
          await tx.user.update({
            where: { id: userId },
            data: { nationality: params.nationality },
          });
        }

        const reservation = await tx.reservation.create({
          data: {
            userId,
            bookingCode,
            packageId: params.packageId ?? null,
            startDate: params.startDate,
            endDate: params.endDate,
            status: ReservationStatus.ItinerarySubmitted,
            totalCurrency: params.totalCurrency,
            totalAmount: params.totalAmount,
            customItineraryPayload: params.customItineraryPayload,
            serviceItems: {
              create: params.serviceItems.map((item) => ({
                serviceType: item.serviceType,
                serviceDateStart: item.serviceDateStart,
                serviceDateEnd: item.serviceDateEnd,
                province: item.province,
                status: 'UNASSIGNED' as const,
                payoutRate: 0,
              })),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            action: 'reservation.submitted',
            entityType: 'Reservation',
            entityId: reservation.id,
            metadata: {
              bookingCode,
              serviceItemCount: params.serviceItems.length,
              ...(params.auditMetadata ?? {}),
            } as Prisma.InputJsonValue,
          },
        });

        return reservation.id;
      });
    }

    throw new ConflictException('Could not allocate a unique booking code');
  }

  /**
   * Create a payment link for the caller's own secured booking (spec §7.1,
   * ADR 0003). The traveler only ever receives the checkout URL; confirming the
   * receipt stays an authenticated operations action.
   */
  async createPaymentLink(
    actor: AuthUser,
    reservationId: string,
    input: CreatePaymentIntentRequest,
  ): Promise<PaymentIntentDto> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, userId: actor.id },
      select: { id: true },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    return this.payments.createIntent(reservationId, input, actor);
  }
}
