import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Prisma } from '@ota/db';
import {
  departurePlacesLeft,
  isUsPerson,
  planRooms,
  signatureMatches,
  travelerKindOn,
  type BookingExtraInput,
  type BookingPrice,
  type ConsentPurpose,
  type OfacCategory,
  type RoomPlan,
  type TravelerKind,
} from '@ota/domain';
import { encryptPassportNumber } from '@ota/domain/passport-cipher';
import type { BookPackageRequest } from '@ota/schemas';

import { AffidavitsService, type SigningClient } from '../compliance/affidavits.service';
import { ConsentsService } from '../compliance/consents.service';
import type { ResolvedText } from '../compliance/legal-texts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { pricePackageChoice, priceLineRows } from '../travelers/package-pricing';
import { PASSPORT_KEY } from '../travelers/travelers.tokens';

const PACKAGE_INCLUDE = {
  services: {
    include: { inventoryItem: true },
    orderBy: [{ dayOffset: 'asc' as const }, { position: 'asc' as const }],
  },
  tiers: true,
  departures: true,
  extras: true,
};

type BookedPackage = Prisma.PackageGetPayload<{ include: typeof PACKAGE_INCLUDE }>;

interface PlannedExtra extends BookingExtraInput {
  packageExtraId: string;
}

/** Everything a booking needs, checked before anything is written. */
export interface PackageBookingPlan {
  pkg: BookedPackage;
  departureId: string;
  tierId: string | null;
  startDate: Date;
  endDate: Date;
  travelerIds: string[];
  kinds: TravelerKind[];
  rooms: RoomPlan;
  roomIds: string[];
  extras: PlannedExtra[];
  price: BookingPrice;
  consents: { purpose: ConsentPurpose; text: ResolvedText }[];
  affidavits: { traveler: number; category: OfacCategory; signature: string }[];
  statement: ResolvedText | null;
  passportKey: Buffer | null;
}

/** The new booking as `createSubmission` made it. */
export interface SubmittedReservation {
  id: string;
  bookingCode: string;
  startDate: Date;
  endDate: Date;
  totalCurrency: string;
}

function addDays(day: Date, days: number): Date {
  const result = new Date(day);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * The storefront Booking form's booking (Booking board, five steps). `plan`
 * prices the traveler's choices with the M2 rules and checks the departure,
 * the certifications and the consents without writing; `write` then stores
 * the party, rooms, extras, frozen price lines, certifications and consents
 * in the transaction that creates the booking, so they land together or not
 * at all.
 */
@Injectable()
export class PackageBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affidavits: AffidavitsService,
    private readonly consents: ConsentsService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(PASSPORT_KEY) private readonly passportKey: Buffer | null,
  ) {}

  async plan(input: BookPackageRequest): Promise<PackageBookingPlan> {
    const pkg = await this.prisma.package.findUnique({
      where: { id: input.packageId },
      include: PACKAGE_INCLUDE,
    });
    if (!pkg || pkg.status !== 'PUBLISHED') {
      throw new NotFoundException(`Package ${input.packageId} not found`);
    }

    const departure = pkg.departures.find(
      (candidate) => candidate.id === input.departureId,
    );
    if (!departure) {
      throw new BadRequestException(
        `Departure ${input.departureId} is not on this package`,
      );
    }
    if (departure.status !== 'OPEN') {
      throw new ConflictException('That departure is not open for booking');
    }
    const booked = await this.prisma.reservation.aggregate({
      _sum: { partySize: true },
      where: { departureId: departure.id, status: { not: 'CANCELLED' } },
    });
    if (
      input.travelers.length >
      departurePlacesLeft(departure.capacity, booked._sum.partySize ?? 0)
    ) {
      throw new ConflictException('The departure does not have enough places left');
    }

    let tier = pkg.tiers.find((candidate) => candidate.isDefault) ?? null;
    if (input.tierId !== null) {
      tier = pkg.tiers.find((candidate) => candidate.id === input.tierId) ?? null;
      if (!tier) {
        throw new BadRequestException(`Tier ${input.tierId} is not on this package`);
      }
    }

    const startDate = departure.startDate;
    const kinds = input.travelers.map((traveler) =>
      travelerKindOn(traveler.dateOfBirth, startDate),
    );
    if (kinds[0] !== 'ADULT') {
      throw new BadRequestException('The lead traveler must be 18 or over on departure');
    }
    const rooms = planRooms(kinds, input.rooming);

    const extras = input.extras.map((choice): PlannedExtra => {
      const extra = pkg.extras.find(
        (candidate) => candidate.id === choice.packageExtraId && candidate.active,
      );
      if (!extra) {
        throw new BadRequestException(
          `Extra ${choice.packageExtraId} is not offered on this package`,
        );
      }
      return {
        packageExtraId: extra.id,
        label: extra.name,
        unit: extra.priceUnit,
        unitAmount: Number(extra.price),
        quantity: choice.quantity,
      };
    });

    const price = pricePackageChoice(
      pkg,
      {
        tier,
        departure,
        travelDate: startDate,
        travelers: input.travelers.map((traveler, index) => ({
          kind: kinds[index]!,
          dateOfBirth: traveler.dateOfBirth,
        })),
        singleRooms: rooms.singleRooms,
        extras,
      },
      this.tenant.pricing,
    );
    if (
      input.expectedTotal !== undefined &&
      Math.abs(input.expectedTotal - price.total) >= 0.005
    ) {
      throw new ConflictException({
        error: 'PriceChanged',
        message: `The price changed since it was shown; it is now ${price.total.toFixed(2)} ${pkg.currency}`,
        total: price.total.toFixed(2),
      });
    }

    const consents = input.consents.map((consent) => ({
      purpose: consent.purpose,
      text: this.consents.requireText(consent.purpose, consent.textVersion, input.locale),
    }));

    let statement: ResolvedText | null = null;
    if (input.affidavits.length > 0) {
      statement = this.affidavits.requireStatement(input.locale);
      if (statement.version !== input.statementVersion) {
        throw new ConflictException(
          'The certification statement changed since it was shown; read it again and sign',
        );
      }
    }
    for (const affidavit of input.affidavits) {
      const traveler = input.travelers[affidavit.traveler]!;
      if (!isUsPerson({ nationality: traveler.nationality, usPerson: null })) {
        throw new BadRequestException(
          `${traveler.fullName} does not need a travel-category certification`,
        );
      }
      if (!signatureMatches(affidavit.signature, traveler.fullName)) {
        throw new BadRequestException(
          `The signature must be ${traveler.fullName}'s full name as entered`,
        );
      }
    }

    const passportKey = input.travelers.some((traveler) => traveler.passportNumber)
      ? this.requireKey()
      : null;

    return {
      pkg,
      departureId: departure.id,
      tierId: tier?.id ?? null,
      startDate,
      endDate: addDays(startDate, Math.max(0, pkg.durationDays - 1)),
      travelerIds: input.travelers.map(() => randomUUID()),
      kinds,
      rooms,
      roomIds: rooms.rooms.map(() => randomUUID()),
      extras,
      price,
      consents,
      affidavits: input.affidavits,
      statement,
      passportKey,
    };
  }

  /** Store the planned party, price and records inside the booking's transaction. */
  async write(
    tx: Prisma.TransactionClient,
    reservation: SubmittedReservation,
    plan: PackageBookingPlan,
    input: BookPackageRequest,
    userId: string,
    client: SigningClient,
  ): Promise<void> {
    if (plan.roomIds.length > 0) {
      await tx.reservationRoom.createMany({
        data: plan.rooms.rooms.map((room, position) => ({
          id: plan.roomIds[position]!,
          reservationId: reservation.id,
          label: `Room ${position + 1}`,
          capacity: room.capacity,
          position,
        })),
      });
    }

    await tx.reservationTraveler.createMany({
      data: input.travelers.map((traveler, position) => {
        const id = plan.travelerIds[position]!;
        const room = plan.rooms.roomOf[position];
        const lead = position === 0;
        return {
          id,
          reservationId: reservation.id,
          position,
          kind: plan.kinds[position]!,
          isLead: lead,
          fullName: traveler.fullName,
          dateOfBirth: traveler.dateOfBirth,
          nationality: traveler.nationality,
          passportNumberEnc: traveler.passportNumber
            ? encryptPassportNumber(traveler.passportNumber, plan.passportKey!, id)
            : null,
          emergencyContactName: lead ? (input.emergencyContactName ?? null) : null,
          emergencyContactPhone: lead ? (input.emergencyContactPhone ?? null) : null,
          roomId: room === null || room === undefined ? null : plan.roomIds[room]!,
        };
      }),
    });

    const extraLines = plan.price.lines.filter((line) => line.kind === 'EXTRA');
    if (plan.extras.length > 0) {
      await tx.reservationExtra.createMany({
        data: plan.extras.map((extra, position) => ({
          reservationId: reservation.id,
          packageExtraId: extra.packageExtraId,
          label: extra.label,
          unit: extra.unit,
          quantity: extra.quantity,
          unitAmount: extra.unitAmount,
          amount: extraLines[position]?.amount ?? 0,
          currency: reservation.totalCurrency,
          position,
        })),
      });
    }
    await tx.reservationPriceLine.createMany({
      data: priceLineRows(
        plan.price,
        reservation.id,
        plan.travelerIds,
        reservation.totalCurrency,
      ),
    });

    if (input.phone) {
      await tx.user.update({ where: { id: userId }, data: { phone: input.phone } });
    }

    for (const affidavit of plan.affidavits) {
      const traveler = input.travelers[affidavit.traveler]!;
      await this.affidavits.createOnline(
        tx,
        userId,
        reservation,
        {
          id: plan.travelerIds[affidavit.traveler]!,
          fullName: traveler.fullName,
          nationality: traveler.nationality,
        },
        null,
        affidavit,
        plan.statement!,
        client,
      );
    }

    await tx.consentRecord.createMany({
      data: plan.consents.map((consent) => ({
        userId,
        reservationId: reservation.id,
        purpose: consent.purpose,
        granted: true,
        textVersion: consent.text.version,
        textHash: consent.text.hash,
        source: 'BOOKING' as const,
        locale: input.locale ?? null,
      })),
    });
  }

  private requireKey(): Buffer {
    if (!this.passportKey) {
      throw new ServiceUnavailableException(
        'Passport numbers cannot be stored: PASSPORT_ENCRYPTION_KEY is not set',
      );
    }
    return this.passportKey;
  }
}
