import type { AnalyticsOverviewDto, AssistantSummaryDto } from '@ota/schemas';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';

import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';

function money(value: number): string {
  return `€${value.toFixed(2)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const query = year ? `?from=${year}-01-01&to=${year}-12-31` : '';

  let overview: AnalyticsOverviewDto | null = null;
  let loadError: string | null = null;
  try {
    overview = await apiFetch<AnalyticsOverviewDto>(`/analytics/overview${query}`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load analytics.';
  }

  const assistant = overview
    ? await apiFetch<AssistantSummaryDto>(`/assistant/ops-summary${query}`).catch(
        () => null,
      )
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Financial, operational, and quality KPIs (spec §4.9). Bounds are by record creation date."
      />

      <a
        href={`/api/ota/analytics/export/xlsx${query}`}
        className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        Download XLSX digest
      </a>

      {loadError || !overview ? (
        <Alert variant="destructive">{loadError ?? 'No data.'}</Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Gross booking value" value={money(overview.finance.gbv)} />
            <Kpi label="Net revenue" value={money(overview.finance.netRevenue)} />
            <Kpi label="Take rate" value={percent(overview.finance.takeRate)} />
            <Kpi
              label="Average order value"
              value={money(overview.finance.averageOrderValue)}
            />
            <Kpi label="Paid bookings" value={String(overview.finance.paidCount)} />
            <Kpi
              label="Supplier payouts"
              value={money(
                overview.finance.payoutsAccrued + overview.finance.payoutsSettled,
              )}
            />
            <Kpi
              label="Acceptance rate"
              value={percent(overview.operations.acceptanceRate)}
            />
            <Kpi
              label="Avg dispatch response"
              value={`${overview.operations.averageResponseMinutes} min`}
            />
          </div>

          {assistant ? (
            <Card>
              <CardHeader>
                <CardTitle>AI operations summary</CardTitle>
                <CardDescription>
                  Generated from this window&apos;s KPIs (spec §4.8).
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm">{assistant.text}</CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Revenue by payment rail</CardTitle>
              <CardDescription>Paid receipts only</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.finance.byRail.length === 0 ? (
                <Alert>No paid receipts in this window.</Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rail</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.finance.byRail.map((row) => (
                      <TableRow key={row.rail}>
                        <TableCell className="font-medium">
                          {row.rail.replaceAll('_', ' ')}
                        </TableCell>
                        <TableCell>{money(row.amount)}</TableCell>
                        <TableCell>{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Revenue by package type</CardTitle>
              <CardDescription>
                Pre-assembled curated packages vs custom itineraries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Take rate</TableHead>
                    <TableHead>Payments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.finance.byPackageType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium">
                        {row.type === 'PACKAGE' ? 'Curated package' : 'Custom itinerary'}
                      </TableCell>
                      <TableCell>{money(row.amount)}</TableCell>
                      <TableCell>{money(row.netRevenue)}</TableCell>
                      <TableCell>{percent(row.takeRate)}</TableCell>
                      <TableCell>{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Booking funnel</CardTitle>
                <CardDescription>Reservations by status</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.operations.funnel.map((row) => (
                      <TableRow key={row.status}>
                        <TableCell>{row.status.replaceAll('_', ' ')}</TableCell>
                        <TableCell>{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Service geography</CardTitle>
                <CardDescription>Booked services by province</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.geography.length === 0 ? (
                  <Alert>No services booked in this window.</Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Province</TableHead>
                        <TableHead>Services</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.geography.map((row) => (
                        <TableRow key={row.province}>
                          <TableCell>{row.province}</TableCell>
                          <TableCell>{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quality & duty of care</CardTitle>
              <CardDescription>
                {overview.quality.reviewCount} review(s) · incidents:{' '}
                {overview.quality.incidentCount} ({overview.quality.openIncidentCount}{' '}
                open, {overview.quality.highSeverityCount} high/critical)
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Average rating: {overview.quality.averageRating.toFixed(2)} / 5
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
