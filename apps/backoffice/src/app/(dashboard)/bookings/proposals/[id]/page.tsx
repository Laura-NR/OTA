import { cubaProvinceName } from '@ota/domain';
import type { InventoryItemDto, ProposalDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonClassName,
} from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { ProposalComposer, type ComposerItem } from '@/components/proposal-composer';
import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { bookingDates, calendarDate, money } from '@/lib/ops-format';

const VARIANTS: Record<ProposalDto['status'], BadgeVariant> = {
  DRAFT: 'outline',
  SENT: 'info',
  ACCEPTED: 'success',
  DECLINED: 'secondary',
  EXPIRED: 'warning',
};

/** M5: one custom request, its current priced version and the composer. */
export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tb, locale] = await Promise.all([
    getTranslations('proposalsDesk'),
    getTranslations('build'),
    getLocale(),
  ]);
  const proposal = await apiFetch<ProposalDto>(`/proposals/${id}`).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    },
  );
  const inventory = await apiFetch<InventoryItemDto[]>('/inventory').catch(() => []);
  const payload = proposal.request.payload;
  const current = proposal.versions[0];
  const chosen = inventory
    .filter((item) => payload.inventoryItemIds.includes(item.id))
    .map((item): ComposerItem => ({
      id: item.id,
      name: item.name,
      type: item.type,
      province: item.province,
      basePrice: item.basePrice,
      currency: item.currency,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/bookings/proposals"
          className="text-body-sm text-muted hover:text-default"
        >
          {t('back')}
        </Link>
        <PageHeader
          title={proposal.reference}
          description={`${bookingDates(payload.startDate, payload.endDate, locale)} · ${t(
            'party',
            { adults: payload.adults, children: payload.children },
          )}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={VARIANTS[proposal.status]} size="lg">
            {t(`statuses.${proposal.status}`)}
          </Badge>
        </div>
      </div>

      {proposal.status === 'ACCEPTED' && proposal.reservationId ? (
        <Alert>
          {t('accepted', { code: proposal.reservationCode ?? '' })}{' '}
          <Link
            href={`/bookings/${proposal.reservationId}`}
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          >
            {t('openBooking')}
          </Link>
          {proposal.providers ? (
            <span className="mt-1 block text-body-sm">
              {t('providers', {
                confirmed: proposal.providers.confirmed,
                services: proposal.providers.services,
                awaiting: proposal.providers.awaiting,
                arranging: proposal.providers.arranging,
                sent: proposal.providers.requestsSent,
              })}
            </span>
          ) : null}
        </Alert>
      ) : null}
      {proposal.status === 'DECLINED' ? <Alert>{t('declined')}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('requestTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
            <div>
              <dt className="text-caption uppercase text-muted">{t('customer')}</dt>
              <dd className="mt-1">
                {proposal.customerName ?? proposal.customerEmail ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-caption uppercase text-muted">{t('created')}</dt>
              <dd className="mt-1">{calendarDate(proposal.createdAt, locale)}</dd>
            </div>
          </dl>
          {payload.route.length > 0 ? (
            <div>
              <p className="text-caption uppercase text-muted">{t('request.route')}</p>
              <ol className="mt-1 flex flex-col gap-1 text-body-sm">
                {payload.route.map((stop, index) => (
                  <li
                    key={stop.province}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <span>
                      {index + 1}. {cubaProvinceName(stop.province)}
                      {stop.stay ? (
                        <span className="text-muted">
                          {' '}
                          · {tb(`stays.styles.${stop.stay}`)}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono">
                      {tb('route.stopNights', { count: stop.nights })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
            {payload.pace ? (
              <div>
                <dt className="text-caption uppercase text-muted">{t('request.pace')}</dt>
                <dd className="mt-1">{tb(`route.paces.${payload.pace}.label`)}</dd>
              </div>
            ) : null}
            {payload.interests.length > 0 ? (
              <div>
                <dt className="text-caption uppercase text-muted">
                  {t('request.interests')}
                </dt>
                <dd className="mt-1">
                  {payload.interests
                    .map((key) => tb(`route.interestNames.${key}`))
                    .join(' · ')}
                </dd>
              </div>
            ) : null}
            {payload.transport ? (
              <div>
                <dt className="text-caption uppercase text-muted">
                  {t('request.transport')}
                </dt>
                <dd className="mt-1">
                  {tb(`transport.options.${payload.transport}.name`)}
                </dd>
              </div>
            ) : null}
            {payload.guiding ? (
              <div>
                <dt className="text-caption uppercase text-muted">
                  {t('request.guiding')}
                </dt>
                <dd className="mt-1">
                  {tb(`activities.guides.${payload.guiding}.name`)}
                  {payload.interpreter ? ` · ${t('request.interpreter')}` : ''}
                </dd>
              </div>
            ) : null}
            {payload.budgetPerPerson !== null ? (
              <div>
                <dt className="text-caption uppercase text-muted">
                  {t('request.budget')}
                </dt>
                <dd className="mt-1 font-mono">
                  {money(payload.budgetPerPerson, 'EUR', locale)}
                </dd>
              </div>
            ) : null}
            {payload.nationality ? (
              <div>
                <dt className="text-caption uppercase text-muted">
                  {t('request.nationality')}
                </dt>
                <dd className="mt-1">{payload.nationality}</dd>
              </div>
            ) : null}
            {payload.stepFree ? (
              <div>
                <dt className="text-caption uppercase text-muted">
                  {t('request.access')}
                </dt>
                <dd className="mt-1">{tb('stays.stepFree')}</dd>
              </div>
            ) : null}
          </dl>
          {proposal.request.notes ? (
            <div>
              <p className="text-caption uppercase text-muted">{t('requestNotes')}</p>
              <p className="mt-1 whitespace-pre-line text-body-sm">
                {proposal.request.notes}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-caption uppercase text-muted">{t('requestItems')}</p>
            {chosen.length === 0 ? (
              <p className="mt-1 text-body-sm text-muted">{t('noItems')}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1 text-body-sm">
                {chosen.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {item.name}
                      {item.province ? (
                        <span className="text-muted"> · {item.province}</span>
                      ) : null}
                    </span>
                    <span className="font-mono">
                      {money(Number(item.basePrice), item.currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {current ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('currentTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-caption text-muted">
                {t('version', { version: current.version })}
              </span>
              <span className="text-caption text-muted">
                {t('validUntil', {
                  date: calendarDate(current.validUntil, locale),
                })}
              </span>
              {current.hasPdf ? (
                <a
                  href={`/api/ota/proposals/${proposal.id}/versions/${current.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-body-sm font-semibold text-primary-600 underline underline-offset-[3px]"
                >
                  {t('pdf')}
                </a>
              ) : null}
            </div>
            <p className="whitespace-pre-line text-body-sm text-secondary">
              {current.document.summary}
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('line')}</TableHead>
                    <TableHead className="text-right">{t('quantity')}</TableHead>
                    <TableHead className="text-right">{t('unitAmount')}</TableHead>
                    <TableHead className="text-right">{t('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.label}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(line.quantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {money(Number(line.unitAmount), line.currency, locale)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {money(Number(line.amount), line.currency, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end border-t pt-3">
              <span className="text-body font-semibold">
                {t('total')}:{' '}
                <span className="font-mono">
                  {money(Number(current.total), current.currency, locale)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {proposal.status !== 'ACCEPTED' && proposal.status !== 'DECLINED' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('composeTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProposalComposer
              proposalId={proposal.id}
              payload={payload}
              items={chosen}
              current={current}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
