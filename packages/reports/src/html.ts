import type { AnalyticsReportInput } from './workbook';

type Cell = string | number;

function escapeHtml(value: Cell): string {
  return String(value).replace(/[&<>"]/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return character;
    }
  });
}

function table(headers: string[], rows: Cell[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const body = rows
    .map(
      (row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function keyValue(rows: [string, Cell][]): string {
  return table(
    ['Metric', 'Value'],
    rows.map(([label, value]) => [label, value]),
  );
}

/**
 * Render the BI digest as a standalone HTML document for PDF rendering
 * (spec §4.9.5). Pure string in/out; the API owns the Chromium render step.
 */
export function buildAnalyticsHtml(input: AnalyticsReportInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const sections: string[] = [];

  sections.push(
    `<h1>${escapeHtml(input.branding?.agencyName ?? 'OTA')}</h1>`,
    `<p class="muted">Period: ${escapeHtml(input.range.from ?? 'all time')} → ${escapeHtml(
      input.range.to ?? 'now',
    )} · Generated ${escapeHtml(generatedAt.toISOString())}${
      input.branding ? ` · Licence ${escapeHtml(input.branding.licenseNumber)}` : ''
    }</p>`,
  );

  sections.push(
    '<h2>Finance</h2>',
    keyValue([
      ['Gross booking value', input.finance.gbv],
      ['Payouts accrued', input.finance.payoutsAccrued],
      ['Payouts settled', input.finance.payoutsSettled],
      ['Net revenue', input.finance.netRevenue],
      ['Take rate', input.finance.takeRate],
      ['Average order value', input.finance.averageOrderValue],
      ['Paid bookings', input.finance.paidCount],
    ]),
    '<h3>Revenue by package type</h3>',
    table(
      ['Type', 'Amount', 'Net', 'Take rate', 'Payments'],
      input.finance.byPackageType.map((row) => [
        row.type,
        row.amount,
        row.netRevenue,
        row.takeRate,
        row.count,
      ]),
    ),
  );

  sections.push(
    '<h2>Operations</h2>',
    keyValue([
      ['Offers', input.operations.offers],
      ['Accepted', input.operations.accepted],
      ['Declined', input.operations.declined],
      ['Timed out', input.operations.timedOut],
      ['Acceptance rate', input.operations.acceptanceRate],
      ['Average response (min)', input.operations.averageResponseMinutes],
    ]),
  );

  sections.push(
    '<h2>Quality</h2>',
    keyValue([
      ['Reviews', input.quality.reviewCount],
      ['Average rating', input.quality.averageRating],
      ['Incidents', input.quality.incidentCount],
      ['Open incidents', input.quality.openIncidentCount],
      ['High/critical incidents', input.quality.highSeverityCount],
    ]),
  );

  if (input.regulatory) {
    sections.push(
      '<h2>Regulatory</h2>',
      keyValue([
        ['Bookings', input.regulatory.bookings],
        ['Travelers', input.regulatory.travelers],
        ['Bed-nights', input.regulatory.bedNights],
        ['Specialised ratio', input.regulatory.specialisedRatio],
      ]),
      '<h3>Tourism categories</h3>',
      table(
        ['Category', 'Bookings', 'Share'],
        input.regulatory.byCategory.map((row) => [row.category, row.count, row.ratio]),
      ),
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: system-ui, sans-serif; color: #111; margin: 32px; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  h2 { margin: 28px 0 8px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em; }
  h3 { margin: 18px 0 6px; font-size: 14px; }
  .muted { color: #666; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: left; }
  th { background: #f2f2f2; }
</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>`;
}
