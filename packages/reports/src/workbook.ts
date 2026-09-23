import ExcelJS from 'exceljs';

export interface ReportRange {
  from: string | null;
  to: string | null;
}

export interface FinanceReport {
  gbv: number;
  payoutsAccrued: number;
  payoutsSettled: number;
  netRevenue: number;
  takeRate: number;
  averageOrderValue: number;
  paidCount: number;
  byRail: { rail: string; amount: number; count: number }[];
  byPackageType: {
    type: string;
    amount: number;
    count: number;
    netRevenue: number;
    takeRate: number;
  }[];
}

export interface OperationsReport {
  offers: number;
  accepted: number;
  declined: number;
  timedOut: number;
  pending: number;
  acceptanceRate: number;
  timeoutRate: number;
  averageResponseMinutes: number;
  funnel: { status: string; count: number }[];
}

export interface QualityReport {
  reviewCount: number;
  averageRating: number;
  incidentCount: number;
  openIncidentCount: number;
  highSeverityCount: number;
}

export interface RegulatoryReport {
  bookings: number;
  travelers: number;
  bedNights: number;
  specialisedRatio: number;
  byCategory: { category: string; count: number; ratio: number }[];
  nationalities: { nationality: string; count: number }[];
  circuits: { province: string; count: number }[];
}

export interface AnalyticsReportInput {
  range: ReportRange;
  finance: FinanceReport;
  operations: OperationsReport;
  quality: QualityReport;
  geography: { province: string; count: number }[];
  regulatory?: RegulatoryReport;
  branding?: { agencyName: string; licenseNumber: string };
  generatedAt?: Date;
}

type Cell = string | number;

function keyValueSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: [string, Cell][],
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = [{ width: 30 }, { width: 28 }];
  for (const [label, value] of rows) {
    sheet.addRow([label, value]);
  }
}

function tableSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Cell[][],
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(row);
  }
  sheet.columns.forEach((column) => {
    column.width = 24;
  });
}

/**
 * Build the operations/BI digest workbook (spec §4.9.5). Pure data in, XLSX
 * buffer out; the API owns fetching the figures and delivering the file.
 */
export async function buildAnalyticsWorkbook(
  input: AnalyticsReportInput,
): Promise<Buffer> {
  const generatedAt = input.generatedAt ?? new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.branding?.agencyName ?? 'OTA';
  workbook.created = generatedAt;

  keyValueSheet(workbook, 'Summary', [
    ['Agency', input.branding?.agencyName ?? '—'],
    ['Licence', input.branding?.licenseNumber ?? '—'],
    ['From', input.range.from ?? 'all time'],
    ['To', input.range.to ?? 'now'],
    ['Generated', generatedAt.toISOString()],
  ]);

  keyValueSheet(workbook, 'Finance', [
    ['Gross booking value', input.finance.gbv],
    ['Payouts accrued', input.finance.payoutsAccrued],
    ['Payouts settled', input.finance.payoutsSettled],
    ['Net revenue', input.finance.netRevenue],
    ['Take rate', input.finance.takeRate],
    ['Average order value', input.finance.averageOrderValue],
    ['Paid bookings', input.finance.paidCount],
  ]);
  tableSheet(
    workbook,
    'Revenue by rail',
    ['Rail', 'Amount', 'Payments'],
    input.finance.byRail.map((row) => [row.rail, row.amount, row.count]),
  );
  tableSheet(
    workbook,
    'Revenue by package type',
    ['Type', 'Amount', 'Net', 'Take rate', 'Payments'],
    input.finance.byPackageType.map((row) => [
      row.type,
      row.amount,
      row.netRevenue,
      row.takeRate,
      row.count,
    ]),
  );

  keyValueSheet(workbook, 'Operations', [
    ['Offers', input.operations.offers],
    ['Accepted', input.operations.accepted],
    ['Declined', input.operations.declined],
    ['Timed out', input.operations.timedOut],
    ['Pending', input.operations.pending],
    ['Acceptance rate', input.operations.acceptanceRate],
    ['Timeout rate', input.operations.timeoutRate],
    ['Average response (min)', input.operations.averageResponseMinutes],
  ]);
  tableSheet(
    workbook,
    'Funnel',
    ['Status', 'Count'],
    input.operations.funnel.map((row) => [row.status, row.count]),
  );

  keyValueSheet(workbook, 'Quality', [
    ['Reviews', input.quality.reviewCount],
    ['Average rating', input.quality.averageRating],
    ['Incidents', input.quality.incidentCount],
    ['Open incidents', input.quality.openIncidentCount],
    ['High/critical incidents', input.quality.highSeverityCount],
  ]);

  tableSheet(
    workbook,
    'Geography',
    ['Province', 'Services'],
    input.geography.map((row) => [row.province, row.count]),
  );

  if (input.regulatory) {
    keyValueSheet(workbook, 'Regulatory', [
      ['Bookings', input.regulatory.bookings],
      ['Travelers', input.regulatory.travelers],
      ['Bed-nights', input.regulatory.bedNights],
      ['Specialised ratio', input.regulatory.specialisedRatio],
    ]);
    tableSheet(
      workbook,
      'Tourism categories',
      ['Category', 'Bookings', 'Share'],
      input.regulatory.byCategory.map((row) => [row.category, row.count, row.ratio]),
    );
    tableSheet(
      workbook,
      'Nationalities',
      ['Nationality', 'Bookings'],
      input.regulatory.nationalities.map((row) => [row.nationality, row.count]),
    );
    tableSheet(
      workbook,
      'Circuits',
      ['Province', 'Services'],
      input.regulatory.circuits.map((row) => [row.province, row.count]),
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
