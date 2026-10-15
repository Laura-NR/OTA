import type { CustomerDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  buttonClassName,
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
import { opsDate } from '@/lib/ops-format';

const RETENTION_VARIANT: Record<CustomerDto['retentionStatus'], BadgeVariant> = {
  ACTIVE: 'success',
  NOTICE_DUE: 'info',
  GRACE_PERIOD: 'warning',
  PURGE_DUE: 'destructive',
  ANONYMIZED: 'secondary',
};

/**
 * A-Customers: the traveler account list with each account's trip count, last
 * activity and GDPR retention state. OFAC records and the communication history
 * wait for M2/M3, so they are not shown.
 */
export default async function CustomersPage() {
  const t = await getTranslations('backoffice.customers');
  const locale = await getLocale();
  const customers = await apiFetch<CustomerDto[]>('/customers').catch(() => null);
  const rows = customers ?? [];
  const withTrips = rows.filter((customer) => customer.tripCount > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-h3">{t('title')}</h1>
          <p className="text-caption text-muted">
            {t('summary', { accounts: rows.length, withTrips })}
          </p>
        </div>
        <Link
          href="/customers/retention"
          className={cn(buttonClassName({ variant: 'secondary', size: 'sm' }), 'ml-auto')}
        >
          {t('retentionDesk')}
        </Link>
      </div>

      {customers === null ? (
        <Alert variant="destructive">{t('loadError')}</Alert>
      ) : (
        <section
          aria-labelledby="customers-title"
          className="rounded-lg border bg-surface"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
            <h2 id="customers-title" className="font-display text-h2-compact">
              {t('accounts')}
            </h2>
            <p className="text-caption text-muted">
              {t('count', { count: rows.length })}
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title={t('empty')} />
            </div>
          ) : (
            <div className="overflow-x-auto border-t">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('table.customer')}</TableHead>
                    <TableHead scope="col">{t('table.trips')}</TableHead>
                    <TableHead scope="col">{t('table.lastActivity')}</TableHead>
                    <TableHead scope="col">{t('table.retention')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="align-top">
                        <Link
                          href={`/customers/${customer.id}`}
                          aria-label={t('table.openLabel', {
                            name: customer.fullName ?? customer.email,
                          })}
                          className="font-medium text-primary-600 underline-offset-4 hover:underline"
                        >
                          {customer.fullName ?? customer.email}
                        </Link>
                        <div className="text-caption text-muted">
                          {customer.email}
                          {customer.nationality ? ` · ${customer.nationality}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="align-top font-mono">
                        {customer.tripCount}
                      </TableCell>
                      <TableCell className="align-top text-secondary">
                        {customer.lastReservationAt
                          ? opsDate(customer.lastReservationAt, locale)
                          : '—'}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={RETENTION_VARIANT[customer.retentionStatus]}>
                          {t(`retentionStatus.${customer.retentionStatus}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
