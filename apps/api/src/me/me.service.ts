import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@ota/db';
import type { ReservationStatus } from '@ota/domain';
import type {
  MeProfileDto,
  MyDocumentDto,
  MyReservationDetailDto,
  MyReservationListItemDto,
} from '@ota/schemas';

import { PrismaService } from '../prisma/prisma.service';

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

/**
 * The signed-in user's own records for the storefront self-service dashboard.
 * Every query is scoped to the caller — a traveler can never read another
 * traveler's booking.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

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
}
