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
  /** What the traveler pays for this service; absent or null when it is bundled. */
  travelerPrice?: string | null;
  supplier: DocumentSupplier | null;
}

/** A frozen price line of the booking (M2), in order. */
export interface DocumentPriceLine {
  kind: string;
  label: string;
  quantity: string;
  amount: string;
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
  priceLines?: DocumentPriceLine[];
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

/** A service on the traveler's invoice, with its price unless the package bundles it. */
export interface InvoiceServiceLine {
  serviceType: string;
  province: string | null;
  start: string;
  end: string;
  providerName: string | null;
  amount: string | null;
}

export interface InvoiceModel {
  bookingCode: string;
  travelerName: string;
  currency: string;
  services: InvoiceServiceLine[];
  priceLines: DocumentPriceLine[];
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
    services: input.serviceItems.map((item) => ({
      serviceType: item.serviceType,
      province: item.province,
      start: item.serviceDateStart,
      end: item.serviceDateEnd,
      providerName: item.supplier?.fullName ?? null,
      amount: item.travelerPrice ?? null,
    })),
    priceLines: input.priceLines ?? [],
    total: input.totalAmount,
  };
}
