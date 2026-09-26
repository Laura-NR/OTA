import type { RegulatorySummaryDto } from '@ota/schemas';
import {
  Alert,
  Button,
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

export default async function RegulatoryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const query = year ? `?from=${year}-01-01&to=${year}-12-31` : '';

  let summary: RegulatorySummaryDto | null = null;
  let loadError: string | null = null;
  try {
    summary = await apiFetch<RegulatorySummaryDto>(`/analytics/regulatory${query}`);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : 'Could not load the regulatory report.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Regulatory reporting"
        description="MINTUR annual activity summary and ecotourism ratio (spec §4.9.2). Bounds filter by booking creation date; bed-nights are per booking until a party size is recorded."
      />

      {loadError || !summary ? (
        <Alert variant="destructive">{loadError ?? 'No data.'}</Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <form className="flex items-end gap-2">
              <label className="space-y-1 text-sm">
                <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                  Year
                </span>
                <input
                  type="number"
                  name="year"
                  defaultValue={year ?? ''}
                  placeholder="All time"
                  min={2000}
                  max={2100}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-ota-1"
                />
              </label>
              <Button type="submit" size="sm" variant="outline">
                Apply
              </Button>
            </form>
            <a
              href={`/api/ota/analytics/regulatory/fiscal-export${query}`}
              className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Download fiscal ledger (CSV)
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Bookings" value={String(summary.bookings)} />
            <Kpi label="Travelers" value={String(summary.travelers)} />
            <Kpi label="Bed-nights" value={String(summary.bedNights)} />
            <Kpi label="Specialised ratio" value={percent(summary.specialisedRatio)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tourism classification</CardTitle>
              <CardDescription>
                Ecotourism, agrotourism, and nature qualify for the specialised-traffic
                ratio (Resolución 193/2026).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byCategory.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="font-medium">
                        {row.category.replaceAll('_', ' ')}
                      </TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>{percent(row.ratio)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Nationalities</CardTitle>
                <CardDescription>Bookings by traveler nationality</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.nationalities.length === 0 ? (
                  <Alert>No bookings in this window.</Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nationality</TableHead>
                        <TableHead>Bookings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.nationalities.map((row) => (
                        <TableRow key={row.nationality}>
                          <TableCell className="font-medium">{row.nationality}</TableCell>
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
                <CardTitle>Geographic circuits</CardTitle>
                <CardDescription>Booked services by province</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.circuits.length === 0 ? (
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
                      {summary.circuits.map((row) => (
                        <TableRow key={row.province}>
                          <TableCell className="font-medium">{row.province}</TableCell>
                          <TableCell>{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
