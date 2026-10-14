import type { PaymentLedgerEntryDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  cn,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { apiFetch } from '@/lib/api';
import { money, opsDate, opsTime } from '@/lib/ops-format';

const STATUSES = ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED'] as const;
type Status = (typeof STATUSES)[number];

const VARIANTS: Record<Status, BadgeVariant> = {
  PENDING: 'warning',
  AUTHORIZED: 'info',
  PAID: 'success',
  FAILED: 'destructive',
  REFUNDED: 'secondary',
};

function timestamp(value: string, locale: string): string {
  return `${opsDate(value, locale)} · ${opsTime(value, locale)}`;
}

/**
 * A-Payments, read-only for now: the receipt ledger across bookings. Refunds
 * with approvals, proofs, the payout liabilities by province and the rail health
 * arrive with the payment schedule (M4); confirming a receipt stays on the
 * booking's payment panel.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getTranslations('backoffice.paymentsLedger');
  const locale = await getLocale();
  const { status } = await searchParams;
  const filter = STATUSES.find((candidate) => candidate === status);
  const entries = await apiFetch<PaymentLedgerEntryDto[]>('/payments?limit=500').catch(
    () => null,
  );

  const all = entries ?? [];
  const rows = filter ? all.filter((entry) => entry.status === filter) : all;
  const counts = Object.fromEntries(
    STATUSES.map((candidate) => [
      candidate,
      all.filter((entry) => entry.status === candidate).length,
    ]),
  ) as Record<Status, number>;
  const paidTotal = all
    .filter((entry) => entry.status === 'PAID')
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const currency = all[0]?.currency ?? 'EUR';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-h3">{t('title')}</h1>
          <p className="text-caption text-muted">
            {t('summary', {
              paid: money(paidTotal, currency, locale),
              pending: counts.PENDING,
              refunded: counts.REFUNDED,
            })}
          </p>
        </div>
      </div>

      {entries === null ? (
        <Alert variant="destructive">{t('loadError')}</Alert>
      ) : (
        <>
          <nav aria-label={t('status')} className="flex flex-wrap gap-2">
            {(['all', ...STATUSES] as const).map((candidate) => {
              const active = candidate === 'all' ? !filter : candidate === filter;
              const href =
                candidate === 'all' ? '/payments' : `/payments?status=${candidate}`;
              return (
                <Link
                  key={candidate}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-full border px-3 font-mono text-caption',
                    active
                      ? 'border-primary-600 bg-primary-600 text-on-primary'
                      : 'bg-surface text-secondary hover:bg-neutral-100',
                  )}
                >
                  {candidate === 'all' ? t('allStatuses') : candidate}
                  <span className="font-semibold">
                    {candidate === 'all' ? all.length : counts[candidate]}
                  </span>
                </Link>
              );
            })}
          </nav>

          <section
            aria-labelledby="ledger-title"
            className="rounded-lg border bg-surface"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <h2 id="ledger-title" className="font-display text-h2-compact">
                {t('ledger')}
              </h2>
              <p className="text-caption text-muted">
                {t('showing', { count: rows.length })}
              </p>
            </div>

            {rows.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState title={t('empty')} />
              </div>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('booking')}</TableHead>
                      <TableHead scope="col">{t('rail')}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {t('amount')}
                      </TableHead>
                      <TableHead scope="col">{t('status')}</TableHead>
                      <TableHead scope="col">{t('created')}</TableHead>
                      <TableHead scope="col">{t('updated')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((entry) => (
                      <TableRow
                        key={entry.id}
                        tone={entry.status === 'FAILED' ? 'destructive' : undefined}
                      >
                        <TableCell>
                          <Link
                            href={`/bookings/${entry.reservationId}`}
                            aria-label={t('openLabel', { code: entry.bookingCode })}
                            className="font-mono font-medium text-primary-600 underline-offset-4 hover:underline"
                          >
                            {entry.bookingCode}
                          </Link>
                        </TableCell>
                        <TableCell>{t(`rails.${entry.rail}`)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {money(Number(entry.amount), entry.currency, locale)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={VARIANTS[entry.status]}>{entry.status}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-secondary">
                          {timestamp(entry.createdAt, locale)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-secondary">
                          {timestamp(entry.updatedAt, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <p className="rounded-lg border bg-surface px-5 py-3 text-caption text-muted">
            {t('later')}
          </p>
        </>
      )}
    </div>
  );
}
