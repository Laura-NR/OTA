import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Prisma } from '@ota/db';
import {
  departurePlacesLeft,
  isPriceLocked,
  type BookingExtraInput,
  type BookingPrice,
  type ReservationStatus,
  type TravelerKind,
} from '@ota/domain';
import {
  PassportCipherError,
  decryptPassportNumber,
  encryptPassportNumber,
} from '@ota/domain/passport-cipher';
import type {
  AddReservationExtraRequest,
  ReservationExtraDto,
  ReservationPartyDto,
  ReservationPriceLinesDto,
  TravelerPassportDto,
  UpdateReservationPartyRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { pricePackageChoice, priceLineRows } from './package-pricing';
import { PASSPORT_KEY } from './travelers.tokens';

const PARTY_INCLUDE = {
  rooms: { orderBy: { position: 'asc' } },
  travelers: { orderBy: { position: 'asc' } },
  extras: { orderBy: { position: 'asc' } },
} as const;

/** Everything a reprice reads: the package terms and the booking's own choices. */
const PRICING_INCLUDE = {
  ...PARTY_INCLUDE,
  package: { include: { tiers: true, departures: true, extras: true } },
  priceLines: { orderBy: { position: 'asc' } },
} as const;

type PartyRow = Prisma.ReservationGetPayload<{ include: typeof PARTY_INCLUDE }>;
type PricingRow = Prisma.ReservationGetPayload<{ include: typeof PRICING_INCLUDE }>;
type PackageRow = NonNullable<PricingRow['package']>;
type ExtraRow = PricingRow['extras'][number];
type Tx = Prisma.TransactionClient;

interface PricedTraveler {
  kind: TravelerKind;
  dateOfBirth: Date | null;
}

interface PricingChoice {
  tierId: string | null;
  departureId: string | null;
  travelers: readonly PricedTraveler[];
  singleRooms: number;
  extras: readonly BookingExtraInput[];
}

function isoDay(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toExtraDto(row: ExtraRow): ReservationExtraDto {
  return {
    id: row.id,
    packageExtraId: row.packageExtraId,
    label: row.label,
    unit: row.unit,
    quantity: row.quantity,
    unitAmount: row.unitAmount.toFixed(2),
    amount: row.amount.toFixed(2),
    currency: row.currency,
  };
}

function toPartyDto(row: PartyRow): ReservationPartyDto {
  return {
    reservationId: row.id,
    partySize: row.partySize,
    tierId: row.tierId,
    departureId: row.departureId,
    priced: row.packageId !== null,
    priceLocked: isPriceLocked(row.status as ReservationStatus),
    rooms: row.rooms.map((room) => ({
      id: room.id,
      label: room.label,
      capacity: room.capacity,
      position: room.position,
    })),
    travelers: row.travelers.map((traveler) => ({
      id: traveler.id,
      position: traveler.position,
      kind: traveler.kind,
      isLead: traveler.isLead,
      fullName: traveler.fullName,
      dateOfBirth: isoDay(traveler.dateOfBirth),
      nationality: traveler.nationality,
      usPerson: traveler.usPerson,
      hasPassport: traveler.passportNumberEnc !== null,
      passportExpiresAt: isoDay(traveler.passportExpiresAt),
      emergencyContactName: traveler.emergencyContactName,
      emergencyContactPhone: traveler.emergencyContactPhone,
      roomId: traveler.roomId,
    })),
    extras: row.extras.map(toExtraDto),
  };
}

function extraInputs(extras: readonly ExtraRow[]): BookingExtraInput[] {
  return extras.map((extra) => ({
    label: extra.label,
    unit: extra.unit,
    unitAmount: Number(extra.unitAmount),
    quantity: extra.quantity,
  }));
}

/** The booking's current choices, as stored. */
function storedChoice(row: PricingRow): PricingChoice {
  return {
    tierId: row.tierId,
    departureId: row.departureId,
    // A booking nobody has named yet is priced as its party size in adults.
    travelers:
      row.travelers.length > 0
        ? row.travelers
        : Array.from({ length: row.partySize }, () => ({
            kind: 'ADULT' as const,
            dateOfBirth: null,
          })),
    singleRooms: row.rooms.filter((room) => room.capacity === 1).length,
    extras: extraInputs(row.extras),
  };
}

function sameLines(price: BookingPrice, stored: PricingRow['priceLines']): boolean {
  return (
    price.lines.length === stored.length &&
    price.lines.every((line, index) => {
      const existing = stored[index]!;
      return (
        line.kind === existing.kind &&
        line.label === existing.label &&
        line.quantity === Number(existing.quantity) &&
        line.amount === Number(existing.amount)
      );
    })
  );
}

/**
 * M2 party and travelers (`docs/schema-m2-travelers.md` §5): who travels on a
 * booking, the rooming list, the extras and the frozen price lines, plus the
 * audited passport vault. A package booking is repriced with the domain
 * `priceBooking` on every change until a payment link locks its price.
 */
@Injectable()
export class TravelersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(PASSPORT_KEY) private readonly passportKey: Buffer | null,
  ) {}

  async getParty(reservationId: string): Promise<ReservationPartyDto> {
    const row = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: PARTY_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    return toPartyDto(row);
  }

  async getPriceLines(reservationId: string): Promise<ReservationPriceLinesDto> {
    const row = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { priceLines: { orderBy: { position: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const total = row.priceLines.reduce((sum, line) => sum + Number(line.amount), 0);
    return {
      reservationId: row.id,
      currency: row.totalCurrency,
      total: total.toFixed(2),
      lines: row.priceLines.map((line) => ({
        id: line.id,
        kind: line.kind,
        label: line.label,
        quantity: line.quantity.toString(),
        unitAmount: line.unitAmount.toFixed(2),
        amount: line.amount.toFixed(2),
        currency: line.currency,
        travelerId: line.travelerId,
        position: line.position,
      })),
    };
  }

  /**
   * Replace the party: rooms and travelers are the whole list. A passport
   * number left out keeps the stored one; a new one is encrypted with the
   * traveler's id bound in, so the ciphertext only opens on its own row.
   */
  async updateParty(
    reservationId: string,
    input: UpdateReservationPartyRequest,
    actor: AuthUser,
  ): Promise<ReservationPartyDto> {
    const row = await this.loadForPricing(reservationId);

    if (!row.package && (input.tierId !== null || input.departureId !== null)) {
      throw new BadRequestException('A custom trip has no tier or departure to choose');
    }
    if (row.package) {
      await this.assertDeparture(
        row,
        row.package,
        input.departureId,
        input.travelers.length,
      );
      if (input.tierId && !row.package.tiers.some((tier) => tier.id === input.tierId)) {
        throw new BadRequestException(`Tier ${input.tierId} is not on this package`);
      }
    }

    const known = new Set(row.travelers.map((traveler) => traveler.id));
    const unknown = input.travelers.find(
      (traveler) => traveler.id && !known.has(traveler.id),
    );
    if (unknown) {
      throw new BadRequestException(`Traveler ${unknown.id} is not on this booking`);
    }
    const key = input.travelers.some(
      (traveler) => typeof traveler.passportNumber === 'string',
    )
      ? this.requireKey()
      : null;

    const price = this.reprice(row, {
      tierId: input.tierId,
      departureId: input.departureId,
      travelers: input.travelers,
      singleRooms: input.rooms.filter((room) => room.capacity === 1).length,
      extras: extraInputs(row.extras),
    });

    const roomIds = input.rooms.map(() => randomUUID());
    const travelerIds = input.travelers.map((traveler) => traveler.id ?? randomUUID());
    const flaggedLead = input.travelers.findIndex((traveler) => traveler.isLead);
    const leadIndex = flaggedLead === -1 ? 0 : flaggedLead;
    let passportsSet = 0;
    let passportsCleared = 0;

    await this.prisma.$transaction(async (tx) => {
      // Deleting the rooms unassigns the travelers (ON DELETE SET NULL); each
      // traveler below is pointed at its new room again.
      await tx.reservationRoom.deleteMany({ where: { reservationId } });
      if (input.rooms.length > 0) {
        await tx.reservationRoom.createMany({
          data: input.rooms.map((room, position) => ({
            id: roomIds[position]!,
            reservationId,
            label: room.label,
            capacity: room.capacity,
            position,
          })),
        });
      }
      await tx.reservationTraveler.deleteMany({
        where: { reservationId, id: { notIn: travelerIds } },
      });

      for (const [position, traveler] of input.travelers.entries()) {
        const id = travelerIds[position]!;
        const passport =
          traveler.passportNumber === undefined
            ? {}
            : {
                passportNumberEnc:
                  traveler.passportNumber === null
                    ? null
                    : encryptPassportNumber(traveler.passportNumber, key!, id),
              };
        if (traveler.passportNumber === null) passportsCleared += 1;
        if (typeof traveler.passportNumber === 'string') passportsSet += 1;

        const data = {
          position,
          kind: traveler.kind,
          isLead: position === leadIndex,
          fullName: traveler.fullName,
          dateOfBirth: traveler.dateOfBirth,
          nationality: traveler.nationality,
          usPerson: traveler.usPerson,
          passportExpiresAt: traveler.passportExpiresAt,
          emergencyContactName: traveler.emergencyContactName,
          emergencyContactPhone: traveler.emergencyContactPhone,
          roomId: traveler.room === null ? null : roomIds[traveler.room]!,
          ...passport,
        };
        if (traveler.id) {
          await tx.reservationTraveler.update({ where: { id }, data });
        } else {
          await tx.reservationTraveler.create({ data: { id, reservationId, ...data } });
        }
      }

      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          partySize: input.travelers.length,
          tierId: input.tierId,
          departureId: input.departureId,
          ...(price ? { totalAmount: price.total } : {}),
        },
      });
      if (price) {
        await this.writePrice(tx, row, price, travelerIds, row.extras);
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'reservation.party_updated',
          entityType: 'Reservation',
          entityId: reservationId,
          // Counts only: names and passport numbers never reach the audit log.
          metadata: {
            travelers: input.travelers.length,
            rooms: input.rooms.length,
            passportsSet,
            passportsCleared,
            repriced: price !== null,
            total: price ? price.total.toFixed(2) : null,
          },
        },
      });
    });

    return this.getParty(reservationId);
  }

  async addExtra(
    reservationId: string,
    input: AddReservationExtraRequest,
    actor: AuthUser,
  ): Promise<ReservationExtraDto> {
    const row = await this.loadForPricing(reservationId);
    const pkg = this.requireRepriceable(row);

    let extra: Pick<ExtraRow, 'packageExtraId' | 'label' | 'unit' | 'quantity'> & {
      unitAmount: number;
    };
    if ('packageExtraId' in input) {
      const source = pkg.extras.find(
        (candidate) => candidate.id === input.packageExtraId && candidate.active,
      );
      if (!source) {
        throw new BadRequestException(
          `Extra ${input.packageExtraId} is not offered on this package`,
        );
      }
      extra = {
        packageExtraId: source.id,
        label: source.name,
        unit: source.priceUnit,
        unitAmount: Number(source.price),
        quantity: input.quantity,
      };
    } else {
      extra = {
        packageExtraId: null,
        label: input.label,
        unit: input.unit,
        unitAmount: input.unitAmount,
        quantity: input.quantity,
      };
    }

    const choice = storedChoice(row);
    const price = this.reprice(row, { ...choice, extras: [...choice.extras, extra] })!;
    // The new extra prices last, so its amount is the last extra line.
    const amount = price.lines.filter((line) => line.kind === 'EXTRA').at(-1)!.amount;

    const created = await this.prisma.$transaction(async (tx) => {
      const createdExtra = await tx.reservationExtra.create({
        data: {
          id: randomUUID(),
          reservationId,
          packageExtraId: extra.packageExtraId,
          label: extra.label,
          unit: extra.unit,
          quantity: extra.quantity,
          unitAmount: extra.unitAmount,
          amount,
          currency: row.totalCurrency,
          position: row.extras.length,
        },
      });
      await tx.reservation.update({
        where: { id: reservationId },
        data: { totalAmount: price.total },
      });
      await this.writePrice(
        tx,
        row,
        price,
        row.travelers.map((traveler) => traveler.id),
        row.extras,
      );
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'reservation.extra_added',
          entityType: 'Reservation',
          entityId: reservationId,
          metadata: {
            extraId: createdExtra.id,
            label: extra.label,
            amount: amount.toFixed(2),
            total: price.total.toFixed(2),
          },
        },
      });
      return createdExtra;
    });

    return toExtraDto(created);
  }

  async removeExtra(
    reservationId: string,
    extraId: string,
    actor: AuthUser,
  ): Promise<void> {
    const row = await this.loadForPricing(reservationId);
    this.requireRepriceable(row);
    const target = row.extras.find((extra) => extra.id === extraId);
    if (!target) {
      throw new NotFoundException(`Extra ${extraId} is not on this booking`);
    }

    const remaining = row.extras.filter((extra) => extra.id !== extraId);
    const price = this.reprice(row, {
      ...storedChoice(row),
      extras: extraInputs(remaining),
    })!;

    await this.prisma.$transaction(async (tx) => {
      await tx.reservationExtra.delete({ where: { id: extraId } });
      await tx.reservation.update({
        where: { id: reservationId },
        data: { totalAmount: price.total },
      });
      await this.writePrice(
        tx,
        row,
        price,
        row.travelers.map((traveler) => traveler.id),
        remaining,
      );
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'reservation.extra_removed',
          entityType: 'Reservation',
          entityId: reservationId,
          metadata: { extraId, label: target.label, total: price.total.toFixed(2) },
        },
      });
    });
  }

  /**
   * The vault view (D1): decrypt one traveler's passport number. The read is
   * audited before the number leaves the API, and the audit row records who
   * and which traveler, never the number.
   */
  async revealPassport(
    reservationId: string,
    travelerId: string,
    actor: AuthUser,
  ): Promise<TravelerPassportDto> {
    const key = this.requireKey();
    const traveler = await this.prisma.reservationTraveler.findUnique({
      where: { id: travelerId },
    });
    if (!traveler || traveler.reservationId !== reservationId) {
      throw new NotFoundException(`Traveler ${travelerId} is not on this booking`);
    }
    if (!traveler.passportNumberEnc) {
      throw new NotFoundException('No passport number is on file for this traveler');
    }

    let passportNumber: string;
    try {
      passportNumber = decryptPassportNumber(
        traveler.passportNumberEnc,
        key,
        traveler.id,
      );
    } catch (error) {
      if (error instanceof PassportCipherError) {
        throw new InternalServerErrorException(
          'The passport number could not be decrypted with the configured key',
        );
      }
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'traveler.passport_viewed',
        entityType: 'Reservation',
        entityId: reservationId,
        metadata: { travelerId },
      },
    });

    return {
      travelerId: traveler.id,
      passportNumber,
      passportExpiresAt: isoDay(traveler.passportExpiresAt),
    };
  }

  private async loadForPricing(reservationId: string): Promise<PricingRow> {
    const row = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: PRICING_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    return row;
  }

  private requireKey(): Buffer {
    if (!this.passportKey) {
      throw new ServiceUnavailableException(
        'Passport numbers cannot be stored or read: PASSPORT_ENCRYPTION_KEY is not set',
      );
    }
    return this.passportKey;
  }

  /** Extras change the price, so they need a package booking whose price is open. */
  private requireRepriceable(row: PricingRow): PackageRow {
    if (!row.package) {
      throw new ConflictException(
        'Extras are priced on package bookings; a custom trip is priced by hand',
      );
    }
    if (isPriceLocked(row.status as ReservationStatus)) {
      throw new ConflictException('The price is locked: a payment link was already sent');
    }
    return row.package;
  }

  /** A chosen departure must be on the package, open when newly chosen, and have room. */
  private async assertDeparture(
    row: PricingRow,
    pkg: PackageRow,
    departureId: string | null,
    partySize: number,
  ): Promise<void> {
    if (departureId === null) {
      return;
    }
    const departure = pkg.departures.find((candidate) => candidate.id === departureId);
    if (!departure) {
      throw new BadRequestException(`Departure ${departureId} is not on this package`);
    }
    if (departure.id !== row.departureId && departure.status !== 'OPEN') {
      throw new ConflictException('That departure is not open for booking');
    }

    const booked = await this.prisma.reservation.aggregate({
      _sum: { partySize: true },
      where: { departureId, id: { not: row.id }, status: { not: 'CANCELLED' } },
    });
    if (partySize > departurePlacesLeft(departure.capacity, booked._sum.partySize ?? 0)) {
      throw new ConflictException('The departure does not have enough places left');
    }
  }

  /**
   * Price a package booking for a choice, or null when the booking keeps its
   * price: a custom trip, or a locked booking priced before M2 (no lines).
   * A locked booking whose lines would move is refused.
   */
  private reprice(row: PricingRow, choice: PricingChoice): BookingPrice | null {
    if (!row.package) {
      return null;
    }

    const tier = choice.tierId
      ? row.package.tiers.find((candidate) => candidate.id === choice.tierId)
      : undefined;
    const departure = choice.departureId
      ? row.package.departures.find((candidate) => candidate.id === choice.departureId)
      : undefined;

    const price = pricePackageChoice(
      row.package,
      {
        tier: tier ?? null,
        departure: departure ?? null,
        travelDate: departure?.startDate ?? row.startDate,
        travelers: choice.travelers,
        singleRooms: choice.singleRooms,
        extras: choice.extras,
      },
      this.tenant.pricing,
    );

    if (!isPriceLocked(row.status as ReservationStatus)) {
      return price;
    }
    if (row.priceLines.length === 0 || sameLines(price, row.priceLines)) {
      return null;
    }
    throw new ConflictException(
      'The price is locked: a payment link was already sent, so this change would move it',
    );
  }

  /**
   * Freeze the lines (each linked to its traveler where it is per person) and
   * store each extra's amount; `extras` are in the order they were priced.
   */
  private async writePrice(
    tx: Tx,
    row: PricingRow,
    price: BookingPrice,
    travelerIds: readonly string[],
    extras: readonly Pick<ExtraRow, 'id'>[],
  ): Promise<void> {
    await tx.reservationPriceLine.deleteMany({ where: { reservationId: row.id } });
    await tx.reservationPriceLine.createMany({
      data: priceLineRows(price, row.id, travelerIds, row.totalCurrency),
    });

    const extraLines = price.lines.filter((line) => line.kind === 'EXTRA');
    for (const [index, extra] of extras.entries()) {
      await tx.reservationExtra.update({
        where: { id: extra.id },
        data: { amount: extraLines[index]?.amount ?? 0 },
      });
    }
  }
}
