export interface DocumentSupplier {
  fullName: string | null;
  primaryPhone: string;
}

export interface DocumentServiceItem {
  id: string;
  serviceType: string;
  province: string | null;
  serviceDateStart: string;
  serviceDateEnd: string;
  payoutRate: string;
  supplier: DocumentSupplier | null;
}

export interface ReservationDocumentInput {
  bookingCode: string;
  startDate: string;
  endDate: string;
  totalCurrency: string;
  totalAmount: string;
  status: string;
  traveler: { fullName: string | null; email: string };
  serviceItems: DocumentServiceItem[];
}

export interface VoucherModel {
  bookingCode: string;
  travelerName: string;
  travelerEmail: string;
  startDate: string;
  endDate: string;
  totalCurrency: string;
  totalAmount: string;
  services: Array<{
    serviceType: string;
    province: string | null;
    start: string;
    end: string;
    supplierName: string | null;
    supplierPhone: string | null;
  }>;
}

export interface WorkOrderModel {
  bookingCode: string;
  serviceItemId: string;
  serviceType: string;
  province: string | null;
  start: string;
  end: string;
  payoutRate: string;
  supplierName: string | null;
  supplierPhone: string | null;
  travelerName: string;
}

export interface InvoiceModel {
  bookingCode: string;
  travelerName: string;
  currency: string;
  lines: Array<{ label: string; amount: string }>;
  total: string;
}

function travelerName(input: ReservationDocumentInput): string {
  return input.traveler.fullName?.trim() || input.traveler.email;
}

export function buildVoucherModel(input: ReservationDocumentInput): VoucherModel {
  return {
    bookingCode: input.bookingCode,
    travelerName: travelerName(input),
    travelerEmail: input.traveler.email,
    startDate: input.startDate,
    endDate: input.endDate,
    totalCurrency: input.totalCurrency,
    totalAmount: input.totalAmount,
    services: input.serviceItems.map((item) => ({
      serviceType: item.serviceType,
      province: item.province,
      start: item.serviceDateStart,
      end: item.serviceDateEnd,
      supplierName: item.supplier?.fullName ?? null,
      supplierPhone: item.supplier?.primaryPhone ?? null,
    })),
  };
}

export function buildWorkOrderModels(input: ReservationDocumentInput): WorkOrderModel[] {
  return input.serviceItems
    .filter((item) => item.supplier !== null)
    .map((item) => ({
      bookingCode: input.bookingCode,
      serviceItemId: item.id,
      serviceType: item.serviceType,
      province: item.province,
      start: item.serviceDateStart,
      end: item.serviceDateEnd,
      payoutRate: item.payoutRate,
      supplierName: item.supplier?.fullName ?? null,
      supplierPhone: item.supplier?.primaryPhone ?? null,
      travelerName: travelerName(input),
    }));
}

export function buildInvoiceModel(input: ReservationDocumentInput): InvoiceModel {
  return {
    bookingCode: input.bookingCode,
    travelerName: travelerName(input),
    currency: input.totalCurrency,
    lines: [{ label: 'Travel services', amount: input.totalAmount }],
    total: input.totalAmount,
  };
}
