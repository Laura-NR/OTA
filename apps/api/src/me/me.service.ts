import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { InventoryItem, InventoryType, PackageService, Prisma } from '@ota/db';
import { ReservationStatus, ServiceType } from '@ota/domain';
import { bookingReceivedEmail, type Mailer } from '@ota/email';
import type {
  BookPackageRequest,
  CreateMyReservationRequest,
  CreatePackageBookingRequest,
  CreatePaymentIntentRequest,
  CreateReviewRequest,
  MeProfileDto,
  MyDocumentDto,
  MyReservationDetailDto,
  MyReservationListItemDto,
  MyReviewDto,
  PaymentIntentDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { generateBookingCode } from '../common/booking-code';
import { accountReservationUrl } from '../common/storefront-url';
import type { SigningClient } from '../compliance/affidavits.service';
import { MAILER } from '../email/email.module';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import {
  PackageBookingService,
  type SubmittedReservation,
} from './package-booking.service';

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
    reviews: true;
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
  const review = row.reviews[0];
  return {
    ...toListDto(row),
    review: review
      ? {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
        }
      : null,
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
  /** The catalog price a custom trip charges for it; null inside a package. */
  travelerPrice: number | null;
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
  /** The Booking form's choices (M2); the defaults leave a booking unpriced. */
  partySize?: number;
  tierId?: string | null;
  departureId?: string | null;
  tourismCategory?: Prisma.ReservationCreateInput['tourismCategory'];
  /** More writes that must land with the booking, in its transaction. */
  within?: (
    tx: Prisma.TransactionClient,
    reservation: SubmittedReservation,
  ) => Promise<void>;
}

/** A package's itinerary as service items, each on its day from `startDate`. */
function packageServiceItems(
  services: readonly (PackageService & { inventoryItem: InventoryItem })[],
  startDate: Date,
): SubmissionServiceItem[] {
  return services.map((service) => {
    const serviceDate = new Date(startDate);
    serviceDate.setUTCDate(serviceDate.getUTCDate() + service.dayOffset);
    return {
      serviceType: INVENTORY_TO_SERVICE[service.inventoryItem.type],
      serviceDateStart: serviceDate,
      serviceDateEnd: serviceDate,
      province: service.inventoryItem.province,
      travelerPrice: null,
    };
  });
}

/**
 * The signed-in user's own records for the storefront self-service dashboard.
 * Every query is scoped to the caller — a traveler can never read another
 * traveler's booking.
 */
@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly bookings: PackageBookingService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
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
        reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
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

    const currency = items[0]?.currency ?? 'EUR';
    const serviceItems = input.serviceItems.map((selection) => {
      const item = byId.get(selection.inventoryItemId)!;
      return {
        serviceType: INVENTORY_TO_SERVICE[item.type],
        serviceDateStart: selection.serviceDateStart ?? input.startDate,
        serviceDateEnd: selection.serviceDateEnd ?? input.endDate,
        province: item.province,
        travelerPrice: Number(item.basePrice),
      };
    });
    // The total is the sum of the per-service prices, so the invoice adds up.
    const totalAmount = serviceItems.reduce((sum, item) => sum + item.travelerPrice, 0);

    const createdId = await this.createSubmission(userId, {
      startDate: input.startDate,
      endDate: input.endDate,
      totalCurrency: currency,
      totalAmount,
      customItineraryPayload: { notes: input.notes ?? null, inventoryItemIds: ids },
      nationality: input.nationality,
      serviceItems,
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
    if (!pkg || pkg.status !== 'PUBLISHED') {
      throw new NotFoundException(`Package ${input.packageId} not found`);
    }

    const serviceItems = packageServiceItems(pkg.services, input.startDate);

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
   * The storefront Booking form (Booking board, five steps): book a curated
   * package on a departure with the traveler's party, rooms, tier and extras.
   * The server prices it (M2) and freezes the lines; the US certifications
   * (M3) and the booking consents are written with it. The booking lands at
   * ITINERARY_SUBMITTED, like the other two paths.
   */
  async bookPackage(
    actor: AuthUser,
    input: BookPackageRequest,
    client: SigningClient,
  ): Promise<MyReservationDetailDto> {
    const plan = await this.bookings.plan(input);
    const { pkg, price } = plan;

    const createdId = await this.createSubmission(actor.id, {
      startDate: plan.startDate,
      endDate: plan.endDate,
      totalCurrency: pkg.currency,
      totalAmount: price.total,
      customItineraryPayload: {
        packageId: pkg.id,
        packageSlug: pkg.slug,
        rooming: input.rooming,
        roommateMatch: input.roommateMatch,
        roomRequests: input.roomRequests ?? null,
        notes: input.notes ?? null,
      },
      packageId: pkg.id,
      nationality: input.travelers[0]!.nationality,
      partySize: input.travelers.length,
      tierId: plan.tierId,
      departureId: plan.departureId,
      tourismCategory: pkg.tourismCategory,
      serviceItems: packageServiceItems(pkg.services, plan.startDate),
      // Ids and counts only: no names, dates of birth or passport numbers.
      auditMetadata: {
        packageId: pkg.id,
        packageSlug: pkg.slug,
        departureId: plan.departureId,
        tierId: plan.tierId,
        partySize: input.travelers.length,
        total: price.total.toFixed(2),
        certifications: plan.affidavits.length,
        consents: plan.consents.map((consent) => consent.purpose),
      },
      within: (tx, reservation) =>
        this.bookings.write(tx, reservation, plan, input, actor.id, client),
    });

    const detail = await this.getReservation(actor.id, createdId);
    await this.sendBookingReceived(actor, plan, input, detail);
    return detail;
  }

  /**
   * E-Received (Phase 6): the Booking form's first email. It is best effort —
   * a mail failure never rolls back a request that has already been stored.
   */
  private async sendBookingReceived(
    actor: AuthUser,
    plan: { pkg: { name: string; currency: string }; startDate: Date; endDate: Date },
    input: BookPackageRequest,
    detail: MyReservationDetailDto,
  ): Promise<void> {
    const locale = this.travelerLocale(input.locale);
    try {
      await this.mailer.send(
        bookingReceivedEmail({
          to: actor.email,
          name: input.travelers[0]!.fullName,
          bookingCode: detail.bookingCode,
          packageName: plan.pkg.name,
          startDate: plan.startDate,
          endDate: plan.endDate,
          total: Number(detail.totalAmount),
          currency: plan.pkg.currency,
          portalUrl: accountReservationUrl(this.tenant, locale, detail.id),
          locale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Booking-received email failed for ${detail.bookingCode}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private travelerLocale(value?: string | null): string {
    return value ?? this.tenant.primaryLocale;
  }

  /**
   * Shared submission path for the dynamic builder, curated packages and the
   * Booking form: allocate a unique booking code, persist the reservation, its
   * service items and the caller's `within` writes atomically, record the
   * audit entry, and stamp the traveler's nationality when supplied.
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
            ...(params.partySize !== undefined ? { partySize: params.partySize } : {}),
            tierId: params.tierId ?? null,
            departureId: params.departureId ?? null,
            ...(params.tourismCategory
              ? { tourismCategory: params.tourismCategory }
              : {}),
            customItineraryPayload: params.customItineraryPayload,
            serviceItems: {
              create: params.serviceItems.map((item) => ({
                serviceType: item.serviceType,
                serviceDateStart: item.serviceDateStart,
                serviceDateEnd: item.serviceDateEnd,
                province: item.province,
                status: 'UNASSIGNED' as const,
                payoutRate: 0,
                travelerPrice: item.travelerPrice,
              })),
            },
          },
        });

        await params.within?.(tx, reservation);

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

  /**
   * Record the caller's CSAT review once the trip is completed (spec §4.9.4).
   * One review per booking; it feeds the analytics quality KPIs.
   */
  async createReview(
    userId: string,
    reservationId: string,
    input: CreateReviewRequest,
  ): Promise<MyReviewDto> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, userId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    if (reservation.status !== ReservationStatus.Completed) {
      throw new ConflictException('Reviews can only be left after the trip is completed');
    }

    const existing = await this.prisma.review.findFirst({ where: { reservationId } });
    if (existing) {
      throw new ConflictException('This booking has already been reviewed');
    }

    const review = await this.prisma.review.create({
      data: {
        reservationId,
        rating: input.rating,
        comment: input.comment ?? null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'review.submitted',
        entityType: 'Reservation',
        entityId: reservationId,
        metadata: { rating: input.rating },
      },
    });

    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
    };
  }
}
