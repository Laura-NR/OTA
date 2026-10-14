import { monthRange, zonedMidnight, zonedYearMonth } from '@ota/domain';
import type {
  AnalyticsOverviewDto,
  AssistantSummaryDto,
  IncidentDto,
  RegulatorySummaryDto,
  ReviewDto,
  SupplierReliabilityDto,
} from '@ota/schemas';
import {
  Alert,
  Badge,
  buttonClassName,
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { BarList } from '@/components/bar-list';
import { IncidentResolveButton } from '@/components/incident-resolve-button';
import { KpiCard } from '@/components/kpi-card';
import { apiFetch } from '@/lib/api';
import { money, percent } from '@/lib/ops-format';

const PERIODS = ['mtd', 'lastMonth', 'ytd', 'all'] as const;
type Period = (typeof PERIODS)[number];

const SECTIONS = ['financial', 'regulatory', 'dispatch', 'quality', 'geography'] as const;

const RAILS = ['OPEN_BANKING_SEPA', 'CARD', 'OTHER'] as const;

function severityVariant(severity: string): 'secondary' | 'outline' | 'destructive' {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'destructive';
  return severity === 'MEDIUM' ? 'secondary' : 'outline';
}

/**
 * The reporting window. A preset period is in Havana calendar time; `year`
 * (kept for links made before the merge) is that calendar year.
 */
function rangeFor(
  period: Period,
  year: number | null,
  now: Date,
): { from: Date; to: Date } | null {
  if (year !== null) {
    return {
      from: zonedMidnight(year, 1, 1),
      to: new Date(zonedMidnight(year + 1, 1, 1).getTime() - 1),
    };
  }
  switch (period) {
    case 'mtd':
      return { from: monthRange(now).from, to: now };
    case 'lastMonth': {
      const last = monthRange(now, -1);
      return { from: last.from, to: last.to };
    }
    case 'ytd':
      return { from: zonedMidnight(zonedYearMonth(now).year, 1, 1), to: now };
    case 'all':
      return null;
  }
}

function Section({
  id,
  overline,
  title,
  description,
  children,
}: {
  id: string;
  overline: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-6 flex-col gap-4"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-overline uppercase text-primary-600">{overline}</p>
        <h2 id={`${id}-title`} className="font-display text-h2-compact">
          {title}
        </h2>
        <p className="text-caption text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-surface px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-h4">{title}</h3>
        {description ? <p className="text-caption text-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Figure({
  overline,
  value,
  note,
}: {
  overline: string;
  value: string;
  note?: string;
}) {
  return (
    <KpiCard overline={overline}>
      <span className="font-mono text-h1-compact">{value}</span>
      {note ? <span className="text-caption text-muted">{note}</span> : null}
    </KpiCard>
  );
}

/**
 * Reports (A-Reports, spec §4.9): one page for the financial, regulatory,
 * dispatch, experience and geography figures over a chosen window, with the
 * digests and the fiscal ledger to download. It merges the pre-redesign
 * analytics, regulatory and quality pages.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; year?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations('backoffice.reports');
  const locale = await getLocale();

  const parsedYear = Number.parseInt(params.year ?? '', 10);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : null;
  const period: Period =
    PERIODS.find((candidate) => candidate === params.period) ?? 'ytd';
  const now = new Date();
  const range = rangeFor(period, year, now);
  const query = range
    ? `?from=${range.from.toISOString()}&to=${range.to.toISOString()}`
    : '';

  const [overview, regulatory, incidents, reliability, reviews] = await Promise.all([
    apiFetch<AnalyticsOverviewDto>(`/analytics/overview${query}`).catch(() => null),
    apiFetch<RegulatorySummaryDto>(`/analytics/regulatory${query}`).catch(() => null),
    apiFetch<IncidentDto[]>('/incidents?limit=100').catch(() => []),
    apiFetch<SupplierReliabilityDto[]>('/quality/supplier-reliability').catch(() => []),
    apiFetch<ReviewDto[]>('/reviews?limit=20').catch(() => []),
  ]);
  const assistant = overview
    ? await apiFetch<AssistantSummaryDto>(`/assistant/ops-summary${query}`).catch(
        () => null,
      )
    : null;

  const eur = (amount: number) => money(amount, 'EUR', locale);
  const pct = (fraction: number) => percent(fraction, locale);
  const periodLabel = year !== null ? String(year) : t(`periods.${period}`);
  const railAmount = (rail: string) =>
    overview?.finance.byRail.find((entry) => entry.rail === rail)?.amount ?? 0;
  const openIncidents = incidents.filter((incident) => !incident.resolvedAt);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-h3">{t('title')}</h1>
            <p className="text-caption text-muted">
              {t('caption', { period: periodLabel })}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <a
              href={`/api/ota/analytics/export/pdf${query}`}
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              <Icon name="download" />
              {t('downloadPdf')}
            </a>
            <a
              href={`/api/ota/analytics/export/xlsx${query}`}
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              <Icon name="download" />
              {t('downloadXlsx')}
            </a>
          </div>
        </div>

        <nav aria-label={t('periodLabel')} className="flex flex-wrap gap-2">
          {PERIODS.map((candidate) => {
            const active = year === null && candidate === period;
            return (
              <Link
                key={candidate}
                href={candidate === 'ytd' ? '/reports' : `/reports?period=${candidate}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center rounded-full border px-3 text-body-sm font-medium',
                  active
                    ? 'border-primary-600 bg-primary-600 text-on-primary'
                    : 'bg-surface text-secondary hover:bg-neutral-100',
                )}
              >
                {t(`periods.${candidate}`)}
              </Link>
            );
          })}
        </nav>

        <nav
          aria-label={t('sectionsLabel')}
          className="flex gap-6 overflow-x-auto border-b text-body-sm font-medium"
        >
          {SECTIONS.map((section) => (
            <a
              key={section}
              href={`#${section}`}
              className="-mb-px shrink-0 whitespace-nowrap border-b-[3px] border-transparent pb-2 text-secondary hover:border-primary-600 hover:text-default"
            >
              {t(`sections.${section}`)}
            </a>
          ))}
        </nav>
      </div>

      <Section
        id="financial"
        overline="§4.9.1"
        title={t('financial.title')}
        description={t('financial.description')}
      >
        {overview ? (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Figure overline={t('financial.gbv')} value={eur(overview.finance.gbv)} />
              <Figure
                overline={t('financial.netRevenue')}
                value={eur(overview.finance.netRevenue)}
                note={t('financial.takeRateNote', {
                  rate: pct(overview.finance.takeRate),
                })}
              />
              <Figure
                overline={t('financial.aov')}
                value={eur(overview.finance.averageOrderValue)}
                note={t('financial.paidBookings', { count: overview.finance.paidCount })}
              />
              <Figure
                overline={t('financial.payouts')}
                value={eur(
                  overview.finance.payoutsAccrued + overview.finance.payoutsSettled,
                )}
                note={t('financial.payoutsNote', {
                  accrued: eur(overview.finance.payoutsAccrued),
                  settled: eur(overview.finance.payoutsSettled),
                })}
              />
            </div>

            {assistant ? (
              <Panel
                title={t('financial.aiSummary')}
                description={t('financial.aiSummaryDescription')}
              >
                <p className="text-body-sm">{assistant.text}</p>
              </Panel>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={t('financial.byRail')} description={t('financial.paidOnly')}>
                <BarList
                  label={t('financial.byRail')}
                  items={RAILS.map((rail) => ({
                    key: rail,
                    label: t(`financial.rails.${rail}`),
                    value: railAmount(rail),
                    display: eur(railAmount(rail)),
                  }))}
                />
              </Panel>
              <Panel
                title={t('financial.byPackage')}
                description={t('financial.byPackageDescription')}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('financial.type')}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {t('financial.gbvShort')}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t('financial.takeRate')}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t('financial.aovShort')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.finance.byPackageType.map((row) => (
                      <TableRow key={row.type}>
                        <TableCell className="font-medium">
                          {row.type === 'PACKAGE'
                            ? t('financial.curated')
                            : t('financial.custom')}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {eur(row.amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {pct(row.takeRate)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {eur(row.count > 0 ? row.amount / row.count : 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            </div>
          </>
        ) : (
          <Alert variant="destructive">{t('loadError')}</Alert>
        )}
      </Section>

      <Section
        id="regulatory"
        overline="§4.9.2"
        title={t('regulatory.title')}
        description={t('regulatory.description')}
      >
        {regulatory ? (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Figure
                overline={t('regulatory.specialisedRatio')}
                value={pct(regulatory.specialisedRatio)}
                note={t('regulatory.specialisedNote')}
              />
              <Figure
                overline={t('regulatory.bookings')}
                value={String(regulatory.bookings)}
              />
              <Figure
                overline={t('regulatory.travelers')}
                value={String(regulatory.travelers)}
              />
              <Figure
                overline={t('regulatory.bedNights')}
                value={String(regulatory.bedNights)}
                note={t('regulatory.bedNightsNote')}
              />
            </div>

            <Panel
              title={t('regulatory.classification')}
              description={t('regulatory.classificationDescription')}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('regulatory.category')}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {t('regulatory.bookings')}
                    </TableHead>
                    <TableHead scope="col" className="w-1/2">
                      {t('regulatory.share')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regulatory.byCategory.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="font-mono text-caption">
                        {row.category}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="block h-2 flex-1 rounded-r-sm bg-neutral-100"
                          >
                            <span
                              className="block h-full rounded-r-sm bg-primary-600"
                              style={{ width: `${row.ratio * 100}%` }}
                            />
                          </span>
                          <span className="w-12 text-right font-mono text-secondary">
                            {pct(row.ratio)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title={t('regulatory.nationalities')}
                description={t('regulatory.nationalitiesDescription')}
              >
                {regulatory.nationalities.length === 0 ? (
                  <p className="text-body-sm text-muted">{t('regulatory.noBookings')}</p>
                ) : (
                  <BarList
                    label={t('regulatory.nationalities')}
                    items={regulatory.nationalities.map((row) => ({
                      key: row.nationality,
                      label: row.nationality,
                      value: row.count,
                      display: String(row.count),
                    }))}
                  />
                )}
              </Panel>
              <Panel
                title={t('regulatory.circuits')}
                description={t('regulatory.circuitsDescription')}
              >
                {regulatory.circuits.length === 0 ? (
                  <p className="text-body-sm text-muted">{t('noServices')}</p>
                ) : (
                  <BarList
                    label={t('regulatory.circuits')}
                    items={regulatory.circuits.map((row) => ({
                      key: row.province,
                      label: row.province,
                      value: row.count,
                      display: String(row.count),
                    }))}
                  />
                )}
              </Panel>
            </div>

            <Panel
              title={t('regulatory.fiscal')}
              description={t('regulatory.fiscalDescription')}
            >
              <a
                href={`/api/ota/analytics/regulatory/fiscal-export${query}`}
                className={cn(
                  buttonClassName({ variant: 'secondary', size: 'sm' }),
                  'self-start',
                )}
              >
                <Icon name="download" />
                {t('regulatory.downloadCsv')}
              </a>
            </Panel>
          </>
        ) : (
          <Alert variant="destructive">{t('loadError')}</Alert>
        )}
      </Section>

      <Section
        id="dispatch"
        overline="§4.9.3"
        title={t('dispatch.title')}
        description={t('dispatch.description')}
      >
        {overview ? (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Figure
                overline={t('dispatch.latency')}
                value={t('dispatch.minutes', {
                  minutes: overview.operations.averageResponseMinutes,
                })}
                note={t('dispatch.latencyNote')}
              />
              <Figure
                overline={t('dispatch.acceptance')}
                value={pct(overview.operations.acceptanceRate)}
                note={t('dispatch.acceptanceNote', {
                  accepted: overview.operations.accepted,
                  offers: overview.operations.offers,
                })}
              />
              <Figure
                overline={t('dispatch.timeouts')}
                value={pct(overview.operations.timeoutRate)}
                note={t('dispatch.timeoutsNote', { count: overview.operations.timedOut })}
              />
              <Figure
                overline={t('dispatch.declined')}
                value={String(overview.operations.declined)}
                note={t('dispatch.pendingNote', { count: overview.operations.pending })}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title={t('dispatch.funnel')}
                description={t('dispatch.funnelDescription')}
              >
                <BarList
                  label={t('dispatch.funnel')}
                  items={overview.operations.funnel.map((row) => ({
                    key: row.status,
                    label: row.status,
                    value: row.count,
                    display: String(row.count),
                  }))}
                />
              </Panel>
              <Panel
                title={t('dispatch.reliability')}
                description={t('dispatch.reliabilityDescription')}
              >
                {reliability.length === 0 ? (
                  <p className="text-body-sm text-muted">{t('dispatch.noHistory')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">{t('dispatch.worker')}</TableHead>
                        <TableHead scope="col" className="text-right">
                          {t('dispatch.offers')}
                        </TableHead>
                        <TableHead scope="col" className="text-right">
                          {t('dispatch.accept')}
                        </TableHead>
                        <TableHead scope="col" className="text-right">
                          {t('dispatch.timeout')}
                        </TableHead>
                        <TableHead scope="col" className="text-right">
                          {t('dispatch.response')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reliability.map((row) => (
                        <TableRow key={row.supplierId}>
                          <TableCell className="font-medium">
                            {row.supplierName ?? row.supplierId}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.offers}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {pct(row.acceptanceRate)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {pct(row.timeoutRate)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {t('dispatch.minutes', {
                              minutes: row.averageResponseMinutes,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Panel>
            </div>
          </>
        ) : (
          <Alert variant="destructive">{t('loadError')}</Alert>
        )}
      </Section>

      <Section
        id="quality"
        overline="§4.9.4"
        title={t('quality.title')}
        description={t('quality.description')}
      >
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Figure
            overline={t('quality.rating')}
            value={overview ? `${overview.quality.averageRating.toFixed(1)} / 5` : '—'}
            note={t('quality.reviews', { count: overview?.quality.reviewCount ?? 0 })}
          />
          <Figure overline={t('quality.open')} value={String(openIncidents.length)} />
          <Figure
            overline={t('quality.logged')}
            value={String(incidents.length)}
            note={t('quality.loggedNote')}
          />
          <Figure
            overline={t('quality.severe')}
            value={String(overview?.quality.highSeverityCount ?? 0)}
            note={t('quality.severeNote')}
          />
        </div>
        <Panel title={t('quality.incidentLog')} description={t('quality.newestFirst')}>
          {incidents.length === 0 ? (
            <p className="text-body-sm text-muted">{t('quality.noIncidents')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('quality.booking')}</TableHead>
                  <TableHead scope="col">{t('quality.category')}</TableHead>
                  <TableHead scope="col">{t('quality.severity')}</TableHead>
                  <TableHead scope="col">{t('quality.what')}</TableHead>
                  <TableHead scope="col">{t('quality.status')}</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">{t('quality.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="font-mono">{incident.bookingCode}</TableCell>
                    <TableCell>{incident.category}</TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(incident.severity)}>
                        {incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {incident.description}
                    </TableCell>
                    <TableCell>
                      {incident.resolvedAt ? (
                        <Badge variant="success">{t('quality.resolved')}</Badge>
                      ) : (
                        <Badge variant="outline">{t('quality.openBadge')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {incident.resolvedAt ? null : (
                        <IncidentResolveButton incidentId={incident.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <Panel
          title={t('quality.recentReviews')}
          description={t('quality.recentReviewsDescription')}
        >
          {reviews.length === 0 ? (
            <p className="text-body-sm text-muted">{t('quality.noReviews')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('quality.booking')}</TableHead>
                  <TableHead scope="col">{t('quality.ratingCol')}</TableHead>
                  <TableHead scope="col">{t('quality.comment')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell className="font-mono">{review.bookingCode}</TableCell>
                    <TableCell className="font-mono">{review.rating} / 5</TableCell>
                    <TableCell className="max-w-md truncate">
                      {review.comment ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </Section>

      <Section
        id="geography"
        overline="§4.9.5"
        title={t('geography.title')}
        description={t('geography.description')}
      >
        <Panel
          title={t('geography.byProvince')}
          description={t('geography.byProvinceDescription')}
        >
          {!overview || overview.geography.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noServices')}</p>
          ) : (
            <BarList
              label={t('geography.byProvince')}
              items={overview.geography.map((row) => ({
                key: row.province,
                label: row.province,
                value: row.count,
                display: String(row.count),
              }))}
            />
          )}
        </Panel>
      </Section>
    </div>
  );
}
