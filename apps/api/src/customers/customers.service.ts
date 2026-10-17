import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@ota/db';
import {
  ofacGate,
  retentionStatus,
  type ReservationStatus,
  type RetentionStatus,
} from '@ota/domain';
import type { CustomerDetailDto, CustomerDto, CustomerTripDto } from '@ota/schemas';

import { PrismaService } from '../prisma/prisma.service';

interface CustomerUser {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  nationality: string | null;
  createdAt: Date;
  retentionNoticeSentAt: Date | null;
  retentionConsentGrantedAt: Date | null;
  anonymizedAt: Date | null;
}

interface TripRow {
  id: string;
  bookingCode: string;
  startDate: Date;
  endDate: Date;
  status: ReservationStatus;
  totalAmount: unknown;
  totalCurrency: string;
  completedAt: Date | null;
  createdAt: Date;
  package: { name: string } | null;
  travelers: { id: string; usPerson: boolean | null; nationality: string | null }[];
  affidavits: { travelerId: string | null }[];
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * A-Customers read model: the traveler accounts the desk looks after, with the
 * trip count and the GDPR retention state. The profile adds the customer's
 * trips, with each trip's OFAC position (M3). Preferences wait for their model.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CustomerDto[]> {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: { role: Role.TRAVELER },
      orderBy: { createdAt: 'asc' },
      include: { reservations: { select: { createdAt: true, completedAt: true } } },
    });

    return users.map((user) => {
      const reservations = user.reservations;
      const latestCompletedAt = reservations.reduce<Date | null>(
        (max, row) =>
          row.completedAt && (!max || row.completedAt > max) ? row.completedAt : max,
        null,
      );
      const lastCreatedAt = reservations.reduce<Date | null>(
        (max, row) => (!max || row.createdAt > max ? row.createdAt : max),
        null,
      );
      return this.toDto(user, reservations.length, lastCreatedAt, latestCompletedAt, now);
    });
  }

  async getById(id: string): Promise<CustomerDetailDto> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        reservations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            bookingCode: true,
            startDate: true,
            endDate: true,
            status: true,
            totalAmount: true,
            totalCurrency: true,
            completedAt: true,
            createdAt: true,
            package: { select: { name: true } },
            travelers: { select: { id: true, usPerson: true, nationality: true } },
            affidavits: { select: { travelerId: true } },
          },
        },
      },
    });

    if (!user || user.role !== Role.TRAVELER) {
      throw new NotFoundException(`Customer ${id} not found`);
    }

    const trips = user.reservations as unknown as TripRow[];
    const latestCompletedAt = trips.reduce<Date | null>(
      (max, row) =>
        row.completedAt && (!max || row.completedAt > max) ? row.completedAt : max,
      null,
    );
    const lastCreatedAt = trips.reduce<Date | null>(
      (max, row) => (!max || row.createdAt > max ? row.createdAt : max),
      null,
    );

    return {
      ...this.toDto(user, trips.length, lastCreatedAt, latestCompletedAt, now),
      createdAt: user.createdAt.toISOString(),
      trips: trips.map((row) => this.toTrip(row)),
    };
  }

  private toDto(
    user: CustomerUser,
    tripCount: number,
    lastCreatedAt: Date | null,
    latestCompletedAt: Date | null,
    now: Date,
  ): CustomerDto {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      nationality: user.nationality,
      tripCount,
      lastReservationAt: iso(lastCreatedAt),
      latestCompletedAt: iso(latestCompletedAt),
      retentionStatus: retentionStatus(
        {
          latestCompletedAt,
          noticeSentAt: user.retentionNoticeSentAt,
          consentGrantedAt: user.retentionConsentGrantedAt,
          anonymizedAt: user.anonymizedAt,
        },
        now,
      ) as RetentionStatus,
    };
  }

  private toTrip(row: TripRow): CustomerTripDto {
    const gate = ofacGate(row.travelers ?? [], row.affidavits ?? []);
    return {
      id: row.id,
      bookingCode: row.bookingCode,
      packageName: row.package?.name ?? null,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      status: row.status,
      totalAmount: String(row.totalAmount),
      totalCurrency: row.totalCurrency,
      ofacRequired: gate.required.length,
      ofacMissing: gate.missing.length,
    };
  }
}
