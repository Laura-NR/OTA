import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsHtml,
  buildAnalyticsWorkbook,
  type AnalyticsReportInput,
} from '../src';

const input: AnalyticsReportInput = {
  range: { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' },
  branding: {
    agencyName: 'Authentic Cuba Expeditions',
    licenseNumber: 'MINTUR-2026-XXXX',
  },
  generatedAt: new Date('2026-09-23T00:00:00Z'),
  finance: {
    gbv: 100,
    payoutsAccrued: 30,
    payoutsSettled: 20,
    netRevenue: 50,
    takeRate: 0.5,
    averageOrderValue: 100,
    paidCount: 1,
    byRail: [{ rail: 'CARD', amount: 100, count: 1 }],
    byPackageType: [
      { type: 'PACKAGE', amount: 100, count: 1, netRevenue: 70, takeRate: 0.7 },
      { type: 'CUSTOM', amount: 0, count: 0, netRevenue: 0, takeRate: 0 },
    ],
  },
  operations: {
    offers: 1,
    accepted: 1,
    declined: 0,
    timedOut: 0,
    pending: 0,
    acceptanceRate: 1,
    timeoutRate: 0,
    averageResponseMinutes: 10,
    funnel: [{ status: 'CONFIRMED', count: 1 }],
  },
  quality: {
    reviewCount: 2,
    averageRating: 4.5,
    incidentCount: 1,
    openIncidentCount: 1,
    highSeverityCount: 1,
  },
  geography: [{ province: 'La Habana', count: 3 }],
  regulatory: {
    bookings: 1,
    travelers: 1,
    bedNights: 3,
    specialisedRatio: 1,
    byCategory: [{ category: 'ECOTOURISM', count: 1, ratio: 1 }],
    nationalities: [{ nationality: 'ES', count: 1 }],
    circuits: [{ province: 'La Habana', count: 1 }],
  },
};

describe('buildAnalyticsWorkbook', () => {
  it('writes the expected sheets and figures', async () => {
    const buffer = await buildAnalyticsWorkbook(input);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      expect.arrayContaining([
        'Summary',
        'Finance',
        'Revenue by rail',
        'Revenue by package type',
        'Quality',
        'Regulatory',
      ]),
    );

    const finance = workbook.getWorksheet('Finance');
    expect(finance?.getRow(1).getCell(1).value).toBe('Gross booking value');
    expect(finance?.getRow(1).getCell(2).value).toBe(100);

    const packageType = workbook.getWorksheet('Revenue by package type');
    expect(packageType?.getRow(2).getCell(1).value).toBe('PACKAGE');
    expect(packageType?.getRow(2).getCell(3).value).toBe(70);
  });

  it('omits the regulatory sheets when no report is supplied', async () => {
    const buffer = await buildAnalyticsWorkbook({ ...input, regulatory: undefined });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.getWorksheet('Regulatory')).toBeUndefined();
    expect(workbook.getWorksheet('Finance')).toBeDefined();
  });
});

describe('buildAnalyticsHtml', () => {
  it('renders the digest, branding, and figures as HTML', () => {
    const html = buildAnalyticsHtml(input);

    expect(html).toContain('Authentic Cuba Expeditions');
    expect(html).toContain('MINTUR-2026-XXXX');
    expect(html).toContain('<h2>Finance</h2>');
    expect(html).toContain('PACKAGE');
    expect(html).toContain('Regulatory');
  });

  it('escapes values from the report', () => {
    const html = buildAnalyticsHtml({
      ...input,
      branding: { agencyName: '<script>Bad</script>', licenseNumber: 'X' },
    });

    expect(html).not.toContain('<script>Bad</script>');
    expect(html).toContain('&lt;script&gt;Bad&lt;/script&gt;');
  });
});
