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
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations('backoffice.regulatory');
  const query = year ? `?from=${year}-01-01&to=${year}-12-31` : '';

  let summary: RegulatorySummaryDto | null = null;
  let loadError: string | null = null;
  try {
    summary = await apiFetch<RegulatorySummaryDto>(`/analytics/regulatory${query}`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : t('loadError');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {loadError || !summary ? (
        <Alert variant="destructive">{loadError ?? t('noData')}</Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <form className="flex items-end gap-2">
              <label className="space-y-1 text-sm">
                <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                  {t('year')}
                </span>
                <input
                  type="number"
                  name="year"
                  defaultValue={year ?? ''}
                  placeholder={t('allTime')}
                  min={2000}
                  max={2100}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-ota-1"
                />
              </label>
              <Button type="submit" size="sm" variant="outline">
                {t('apply')}
              </Button>
            </form>
            <a
              href={`/api/ota/analytics/regulatory/fiscal-export${query}`}
              className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {t('downloadCsv')}
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t('bookings')} value={String(summary.bookings)} />
            <Kpi label={t('travelers')} value={String(summary.travelers)} />
            <Kpi label={t('bedNights')} value={String(summary.bedNights)} />
            <Kpi
              label={t('specialisedRatio')}
              value={percent(summary.specialisedRatio)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('classification')}</CardTitle>
              <CardDescription>{t('classificationDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('category')}</TableHead>
                    <TableHead>{t('bookings')}</TableHead>
                    <TableHead>{t('share')}</TableHead>
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
                <CardTitle>{t('nationalities')}</CardTitle>
                <CardDescription>{t('nationalitiesDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.nationalities.length === 0 ? (
                  <Alert>{t('noBookings')}</Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('nationality')}</TableHead>
                        <TableHead>{t('bookings')}</TableHead>
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
                <CardTitle>{t('circuits')}</CardTitle>
                <CardDescription>{t('circuitsDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.circuits.length === 0 ? (
                  <Alert>{t('noServices')}</Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('province')}</TableHead>
                        <TableHead>{t('services')}</TableHead>
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
