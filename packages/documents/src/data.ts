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

/** M10: seats the desk confirmed for an event, printed on the voucher. */
export interface DocumentEventTickets {
  eventName: string;
  place: string;
  categoryName: string;
  seats: number;
  /** The chosen festival nights; empty for a pass, which covers every night. */
  nights: Array<{ date: string; label: string; venue: string | null }>;
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
  eventTickets?: DocumentEventTickets[];
  /** M9 display currencies C6/C7: the booking's locked rate and the total at it. */
  displayReference?: DocumentDisplayReference | null;
}

/** The invoice's reference line (D-Invoice): indicative, every amount stays in EUR. */
export interface DocumentDisplayReference {
  currency: string;
  /** The locked rate, spread included. */
  rate: string;
  /** The rate's day, YYYY-MM-DD. */
  rateDate: string;
  /** The total at that rate, to the cent. */
  amount: string;
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
  eventTickets: DocumentEventTickets[];
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
  displayReference: DocumentDisplayReference | null;
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
    eventTickets: input.eventTickets ?? [],
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
    displayReference: input.displayReference ?? null,
  };
}
