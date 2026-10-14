import type { PaymentLedgerEntryDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';

const STATUSES = ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED'] as const;

const VARIANTS: Record<PaymentLedgerEntryDto['status'], BadgeVariant> = {
  PENDING: 'warning',
  AUTHORIZED: 'info',
  PAID: 'success',
  FAILED: 'destructive',
  REFUNDED: 'secondary',
};

/**
 * A-Payments, read-only for now: the receipt ledger across bookings. Proofs,
 * refunds with approvals and payouts arrive with the payment schedule (M4);
 * confirming a receipt stays on the booking's payment panel.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getTranslations('backoffice.paymentsLedger');
  const { status } = await searchParams;
  const filter = STATUSES.find((candidate) => candidate === status);
  const entries = await apiFetch<PaymentLedgerEntryDto[]>(
    `/payments${filter ? `?status=${filter}` : ''}`,
  ).catch(() => null);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <form action="/payments" method="get" className="flex flex-wrap items-end gap-2">
        <div className="space-y-2">
          <Label htmlFor="payments-status">{t('status')}</Label>
          <Select id="payments-status" name="status" defaultValue={filter ?? ''}>
            <option value="">{t('allStatuses')}</option>
            {STATUSES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {t('apply')}
        </Button>
      </form>
      <Card>
        <CardContent className="pt-6">
          {entries === null ? (
            <Alert variant="destructive">{t('loadError')}</Alert>
          ) : entries.length === 0 ? (
            <Alert>{t('empty')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('booking')}</TableHead>
                  <TableHead>{t('rail')}</TableHead>
                  <TableHead className="text-right">{t('amount')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('created')}</TableHead>
                  <TableHead>{t('updated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    tone={entry.status === 'FAILED' ? 'destructive' : undefined}
                  >
                    <TableCell>
                      <Link
                        href={`/bookings/${entry.reservationId}`}
                        className="font-medium text-primary-600 underline-offset-4 hover:underline"
                      >
                        {entry.bookingCode}
                      </Link>
                    </TableCell>
                    <TableCell>{entry.rail.replaceAll('_', ' ')}</TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.currency} {Number(entry.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={VARIANTS[entry.status]}>{entry.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {entry.createdAt.slice(0, 16).replace('T', ' ')}
                    </TableCell>
                    <TableCell>
                      {entry.updatedAt.slice(0, 16).replace('T', ' ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
