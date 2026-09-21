import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Document, Reservation, ServiceItem, SupplierProfile, User } from '@ota/db';
import {
  buildInvoiceModel,
  buildVoucherModel,
  buildWorkOrderModels,
  renderInvoiceHtml,
  renderVoucherHtml,
  renderWorkOrderHtml,
  type DocumentBranding,
  type ReservationDocumentInput,
} from '@ota/documents';
import { DocumentType, UserRole } from '@ota/domain';
import type { DocumentDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { DOCUMENT_RENDERER, type DocumentRenderer } from './document-renderer';
import { DOCUMENT_STORAGE, type DocumentStorage } from './document-storage';

type ReservationForDocuments = Reservation & {
  user: User;
  serviceItems: Array<
    ServiceItem & { supplier: (SupplierProfile & { user: User }) | null }
  >;
};

function toDocumentDto(document: Document): DocumentDto {
  return {
    id: document.id,
    type: document.type,
    storageKey: document.storageKey,
    generatedAt: document.generatedAt.toISOString(),
  };
}

function toDocumentInput(reservation: ReservationForDocuments): ReservationDocumentInput {
  return {
    bookingCode: reservation.bookingCode,
    startDate: reservation.startDate.toISOString(),
    endDate: reservation.endDate.toISOString(),
    totalCurrency: reservation.totalCurrency,
    totalAmount: reservation.totalAmount.toString(),
    status: reservation.status,
    traveler: {
      fullName: reservation.user.fullName,
      email: reservation.user.email,
    },
    serviceItems: reservation.serviceItems.map((item) => ({
      id: item.id,
      serviceType: item.serviceType,
      province: item.province,
      serviceDateStart: item.serviceDateStart.toISOString(),
      serviceDateEnd: item.serviceDateEnd.toISOString(),
      payoutRate: item.payoutRate.toString(),
      supplier: item.supplier
        ? {
            fullName: item.supplier.user.fullName,
            primaryPhone: item.supplier.primaryPhone,
          }
        : null,
    })),
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  private branding(): DocumentBranding {
    return {
      agencyName: this.tenant.branding.agencyName,
      licenseNumber: this.tenant.branding.licenseNumber,
      primaryColor: this.tenant.branding.primaryColor,
      supportEmail: this.tenant.branding.supportEmail,
      supportPhone: this.tenant.branding.supportPhone,
    };
  }

  async list(reservationId: string): Promise<DocumentDto[]> {
    const documents = await this.prisma.document.findMany({
      where: { reservationId },
      orderBy: { generatedAt: 'asc' },
    });
    return documents.map(toDocumentDto);
  }

  /**
   * Load a stored document for download. A traveler may only fetch documents
   * for their own reservations; operations roles may fetch any.
   */
  async read(
    documentId: string,
    actor: AuthUser,
  ): Promise<{ document: Document; data: Uint8Array }> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { reservation: { select: { userId: true } } },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    if (actor.role === UserRole.Traveler && document.reservation.userId !== actor.id) {
      throw new ForbiddenException('Document belongs to another traveler');
    }
    return { document, data: await this.storage.read(document.storageKey) };
  }

  /**
   * Compile the legal document set for a reservation: traveler voucher, one
   * supplier work order per assigned service, and an invoice. Each PDF is
   * stored and recorded; the caller (or the CONFIRMED transition) invokes this.
   */
  async generate(reservationId: string, actor: AuthUser | null): Promise<DocumentDto[]> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        user: true,
        serviceItems: { include: { supplier: { include: { user: true } } } },
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const input = toDocumentInput(reservation);
    const branding = this.branding();
    const artifacts: Array<{ type: DocumentType; html: string }> = [
      {
        type: DocumentType.Voucher,
        html: renderVoucherHtml(buildVoucherModel(input), branding),
      },
      ...buildWorkOrderModels(input).map((model) => ({
        type: DocumentType.WorkOrder,
        html: renderWorkOrderHtml(model, branding),
      })),
      {
        type: DocumentType.Invoice,
        html: renderInvoiceHtml(buildInvoiceModel(input), branding),
      },
    ];

    const created: DocumentDto[] = [];
    for (const [index, artifact] of artifacts.entries()) {
      const bytes = await this.renderer.render(artifact.html);
      const key = `${reservation.bookingCode}/${artifact.type.toLowerCase()}-${index + 1}.pdf`;
      await this.storage.save(key, bytes);
      const document = await this.prisma.document.create({
        data: { reservationId, type: artifact.type, storageKey: key },
      });
      created.push(toDocumentDto(document));
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor?.id ?? null,
        action: 'documents.generated',
        entityType: 'Reservation',
        entityId: reservationId,
        metadata: { count: created.length },
      },
    });

    return created;
  }
}
