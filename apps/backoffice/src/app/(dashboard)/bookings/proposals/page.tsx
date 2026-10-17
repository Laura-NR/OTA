import type { ProposalListItemDto } from '@ota/schemas';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';
import { bookingDates, money, opsDate } from '@/lib/ops-format';

const VARIANTS: Record<ProposalListItemDto['status'], BadgeVariant> = {
  DRAFT: 'outline',
  SENT: 'info',
  ACCEPTED: 'success',
  DECLINED: 'secondary',
  EXPIRED: 'warning',
};

/** M5: the custom-request queue and the proposals the desk has sent. */
export default async function ProposalsPage() {
  const [t, locale] = await Promise.all([getTranslations('proposalsDesk'), getLocale()]);
  const proposals = await apiFetch<ProposalListItemDto[]>('/proposals?limit=100').catch(
    () => [],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {proposals.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reference')}</TableHead>
                    <TableHead>{t('customer')}</TableHead>
                    <TableHead>{t('dates')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead className="text-right">{t('total')}</TableHead>
                    <TableHead>{t('created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((proposal) => (
                    <TableRow key={proposal.id}>
                      <TableCell className="font-mono">
                        <Link
                          href={`/bookings/proposals/${proposal.id}`}
                          className="text-primary-600 underline-offset-4 hover:underline"
                        >
                          {proposal.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{proposal.customerName ?? proposal.customerEmail}</span>
                          <span className="text-caption text-muted">
                            {proposal.customerEmail}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {bookingDates(proposal.startDate, proposal.endDate, locale)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={VARIANTS[proposal.status]}>
                          {t(`statuses.${proposal.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {proposal.total && proposal.currency
                          ? money(Number(proposal.total), proposal.currency, locale)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-caption text-muted">
                        {opsDate(proposal.createdAt, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
