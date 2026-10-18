import { DEFAULT_LOCALE } from '@ota/i18n';
import type { ProposalDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonClassName,
  Icon,
} from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/account-shell';
import { ProposalActions } from '@/components/account/proposal-actions';
import { ProviderProgress } from '@/components/account/provider-progress';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';
import { formatDay, formatMoney } from '@/lib/format';
import { getTenantConfig } from '@/lib/tenant';

const VARIANTS: Record<ProposalDto['status'], BadgeVariant> = {
  DRAFT: 'outline',
  SENT: 'info',
  ACCEPTED: 'success',
  DECLINED: 'secondary',
  EXPIRED: 'warning',
};

/**
 * The traveler's priced custom proposal (M5, D-Proposal): the request, the
 * current version's summary and price lines, its validity, and accept or
 * decline. It is behind sign-in; accepting creates a booking request and
 * never charges anything.
 */
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) {
    const locale = await getLocale();
    redirect(locale === DEFAULT_LOCALE ? '/login' : `/${locale}/login`);
  }

  const proposal = await apiFetch<ProposalDto>(`/me/proposals/${id}`).catch(() => null);
  if (!proposal) {
    notFound();
  }

  const [t, format, locale] = await Promise.all([
    getTranslations('proposal'),
    getFormatter(),
    getLocale(),
  ]);
  const tenant = getTenantConfig();
  const version = proposal.versions[0];
  const payload = proposal.request.payload;
  const dates = format.dateTimeRange(
    new Date(payload.startDate),
    new Date(payload.endDate),
    { day: 'numeric', month: 'short', year: 'numeric' },
  );
  const card = 'flex flex-col gap-4 rounded-lg border bg-surface p-6';

  return (
    <AccountShell
      current="trips"
      name={session.user.name ?? null}
      email={session.user.email}
      counts={{}}
      emergency={tenant.emergencyContacts[0] ?? null}
    >
      <header className="flex flex-col gap-3">
        <Link
          href="/account?tab=trips"
          className="self-start text-body-sm text-primary-600 underline underline-offset-[3px]"
        >
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-h1-compact text-default">{proposal.reference}</h1>
          <Badge variant={VARIANTS[proposal.status]} size="lg">
            {t(`statuses.${proposal.status}`)}
          </Badge>
        </div>
        <p className="text-body text-secondary">
          {dates} · {t('party', { adults: payload.adults, children: payload.children })}
        </p>
      </header>

      {proposal.status === 'ACCEPTED' && proposal.reservationId ? (
        <section className={card}>
          <p className="text-body text-secondary">
            {t('accepted', { code: proposal.reservationCode ?? '' })}
          </p>
          <Link
            href={`/account/reservations/${proposal.reservationId}`}
            className={buttonClassName({ size: 'lg' })}
          >
            {t('openTrip')}
          </Link>
        </section>
      ) : null}

      {proposal.status === 'ACCEPTED' && proposal.providers ? (
        <ProviderProgress progress={proposal.providers} />
      ) : null}

      {proposal.status === 'DECLINED' ? <Alert>{t('declined')}</Alert> : null}

      {proposal.status === 'EXPIRED' ? <Alert>{t('expired')}</Alert> : null}

      {!version ? (
        <Alert>{proposal.status === 'DRAFT' ? t('draft') : t('noVersion')}</Alert>
      ) : null}

      {version ? (
        <>
          <section className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-h4 text-default">{t('summary')}</h2>
              <span className="text-caption text-muted">
                {t('version', { version: version.version })}
              </span>
            </div>
            <p className="whitespace-pre-line text-body text-secondary">
              {version.document.summary}
            </p>
            <p className="text-body-sm text-muted">
              {t('validUntil', { date: formatDay(version.validUntil, locale) })}
            </p>
            {version.hasPdf ? (
              <a
                href={`/api/ota/me/proposals/${proposal.id}/versions/${version.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 self-start text-body-sm font-semibold text-primary-600 underline underline-offset-[3px]"
              >
                <Icon name="download" className="h-4 w-4" />
                {t('pdf')}
              </a>
            ) : null}
          </section>

          {version.document.stops.length > 0 ? (
            <section aria-labelledby="route-title" className={card}>
              <h2 id="route-title" className="text-h4 text-default">
                {t('route')}
              </h2>
              <ol className="flex flex-col divide-y">
                {version.document.stops.map((stop, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-body font-medium text-default">
                      {stop.province}
                    </span>
                    <span className="text-body-sm text-secondary">
                      {[t('nights', { count: stop.nights }), stop.accommodation]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {version.document.days.length > 0 ? (
            <section aria-labelledby="days-title" className={card}>
              <h2 id="days-title" className="text-h4 text-default">
                {t('days')}
              </h2>
              <ol className="flex flex-col divide-y">
                {[...version.document.days]
                  .sort((a, b) => a.day - b.day)
                  .map((day) => (
                    <li
                      key={day.day}
                      className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
                    >
                      <span className="text-body-sm font-semibold text-default">
                        {t('day', { day: day.day })} ·{' '}
                        {formatDay(
                          new Date(
                            Date.parse(version.document.startDate) +
                              (day.day - 1) * 86_400_000,
                          ).toISOString(),
                          locale,
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-body font-medium text-default">
                          {day.location}
                        </span>
                        <span className="whitespace-pre-line text-body-sm text-secondary">
                          {day.plan}
                        </span>
                        {day.with ? (
                          <span className="text-caption text-muted">
                            {t('with', { name: day.with })}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
              </ol>
            </section>
          ) : null}

          <section className={card}>
            <h2 className="text-h4 text-default">{t('lines')}</h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('line')}</TableHead>
                    <TableHead className="text-right">{t('quantity')}</TableHead>
                    <TableHead className="text-right">{t('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {version.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{line.label}</span>
                          {line.description ? (
                            <span className="text-caption text-muted">
                              {line.description}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(line.quantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoney(line.amount, line.currency, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-4">
              <span className="text-body font-semibold">{t('total')}</span>
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono text-h3">
                  {formatMoney(version.total, version.currency, locale)}
                </span>
                {version.perPerson ? (
                  <span className="text-caption text-muted">
                    {t('perPerson', {
                      amount: formatMoney(version.perPerson, version.currency, locale),
                    })}
                  </span>
                ) : null}
                {typeof version.terms?.planningFee === 'number' ? (
                  <span className="text-caption text-muted">
                    {t('planningFee', {
                      amount: formatMoney(
                        version.terms.planningFee,
                        version.currency,
                        locale,
                      ),
                    })}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {version.document.options.length > 0 ? (
            <section aria-labelledby="options-title" className={card}>
              <h2 id="options-title" className="text-h4 text-default">
                {t('options')}
              </h2>
              <ul className="flex flex-col gap-2">
                {version.document.options.map((option, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body font-medium text-default">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="text-body-sm text-secondary">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {typeof option.price === 'number' ? (
                      <span className="font-mono text-body-sm text-default">
                        {t('optionPrice', {
                          amount: formatMoney(option.price, version.currency, locale),
                        })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-caption text-muted">{t('optionsNote')}</p>
            </section>
          ) : null}

          {proposal.status === 'SENT' ? (
            <section className={card}>
              <ProposalActions proposalId={proposal.id} versionId={version.id} />
            </section>
          ) : null}
        </>
      ) : null}
    </AccountShell>
  );
}
