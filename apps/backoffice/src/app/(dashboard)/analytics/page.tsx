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
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations('backoffice.analytics');
  const query = year ? `?from=${year}-01-01&to=${year}-12-31` : '';

  let overview: AnalyticsOverviewDto | null = null;
  let loadError: string | null = null;
  try {
    overview = await apiFetch<AnalyticsOverviewDto>(`/analytics/overview${query}`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : t('loadError');
  }

  const assistant = overview
    ? await apiFetch<AssistantSummaryDto>(`/assistant/ops-summary${query}`).catch(
        () => null,
      )
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/ota/analytics/export/xlsx${query}`}
          className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {t('downloadXlsx')}
        </a>
        <a
          href={`/api/ota/analytics/export/pdf${query}`}
          className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {t('downloadPdf')}
        </a>
      </div>

      {loadError || !overview ? (
        <Alert variant="destructive">{loadError ?? t('noData')}</Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t('gbv')} value={money(overview.finance.gbv)} />
            <Kpi label={t('netRevenue')} value={money(overview.finance.netRevenue)} />
            <Kpi label={t('takeRate')} value={percent(overview.finance.takeRate)} />
            <Kpi label={t('aov')} value={money(overview.finance.averageOrderValue)} />
            <Kpi label={t('paidBookings')} value={String(overview.finance.paidCount)} />
            <Kpi
              label={t('supplierPayouts')}
              value={money(
                overview.finance.payoutsAccrued + overview.finance.payoutsSettled,
              )}
            />
            <Kpi
              label={t('acceptanceRate')}
              value={percent(overview.operations.acceptanceRate)}
            />
            <Kpi
              label={t('avgResponse')}
              value={`${overview.operations.averageResponseMinutes} min`}
            />
          </div>

          {assistant ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('aiSummary')}</CardTitle>
                <CardDescription>{t('aiSummaryDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm">{assistant.text}</CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('revenueByRail')}</CardTitle>
              <CardDescription>{t('paidOnly')}</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.finance.byRail.length === 0 ? (
                <Alert>{t('noPaid')}</Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rail')}</TableHead>
                      <TableHead>{t('amount')}</TableHead>
                      <TableHead>{t('payments')}</TableHead>
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
              <CardTitle>{t('revenueByPackage')}</CardTitle>
              <CardDescription>{t('packageDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('type')}</TableHead>
                    <TableHead>{t('amount')}</TableHead>
                    <TableHead>{t('net')}</TableHead>
                    <TableHead>{t('takeRate')}</TableHead>
                    <TableHead>{t('payments')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.finance.byPackageType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium">
                        {row.type === 'PACKAGE'
                          ? t('curatedPackage')
                          : t('customItinerary')}
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
                <CardTitle>{t('funnel')}</CardTitle>
                <CardDescription>{t('funnelDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('status')}</TableHead>
                      <TableHead>{t('count')}</TableHead>
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
                <CardTitle>{t('geography')}</CardTitle>
                <CardDescription>{t('geographyDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.geography.length === 0 ? (
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
              <CardTitle>{t('quality')}</CardTitle>
              <CardDescription>
                {t('qualitySummary', {
                  reviews: overview.quality.reviewCount,
                  incidents: overview.quality.incidentCount,
                  open: overview.quality.openIncidentCount,
                  high: overview.quality.highSeverityCount,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {t('averageRating', { value: overview.quality.averageRating.toFixed(2) })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
