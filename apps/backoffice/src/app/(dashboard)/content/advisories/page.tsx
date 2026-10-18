import { UserRole } from '@ota/domain';
import type { AdvisoryListItemDto } from '@ota/schemas';
import {
  Badge,
  buttonClassName,
  Card,
  CardContent,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { SEVERITY_BADGE, STATUS_BADGE } from '@/lib/advisories';
import { regionNames } from '@/lib/advisory-regions';
import { apiFetch, getServerSession } from '@/lib/api';
import { opsDate } from '@/lib/ops-format';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/**
 * A-Content's advisories tab (M7): every advisory with its severity, regions,
 * window and status; rows awaiting approval are tinted as on the board.
 */
export default async function AdvisoriesPage() {
  const [t, locale, session] = await Promise.all([
    getTranslations('advisoriesDesk'),
    getLocale(),
    getServerSession(),
  ]);
  const advisories = await apiFetch<AdvisoryListItemDto[]>('/advisories?limit=200').catch(
    () => [],
  );
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')}>
        {canManage ? (
          <Link href="/content/advisories/new" className={buttonClassName({})}>
            {t('new')}
          </Link>
        ) : null}
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {advisories.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('advisory')}</TableHead>
                    <TableHead>{t('severity')}</TableHead>
                    <TableHead>{t('regionsDates')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advisories.map((advisory) => (
                    <TableRow
                      key={advisory.id}
                      tone={
                        advisory.displayStatus === 'IN_REVIEW' ? 'attention' : undefined
                      }
                    >
                      <TableCell className="min-w-[16rem]">
                        <div className="flex flex-col">
                          <Link
                            href={`/content/advisories/${advisory.id}`}
                            className="font-medium text-primary-600 underline-offset-4 hover:underline"
                          >
                            {advisory.headline}
                          </Link>
                          <span className="text-caption text-muted">
                            <span className="font-mono">{advisory.reference}</span>
                            {advisory.createdByName
                              ? ` · ${t('by', { name: advisory.createdByName })}`
                              : null}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={SEVERITY_BADGE[advisory.severity]}>
                          {t(`severities.${advisory.severity}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>
                            {regionNames(advisory.regions) ?? t('wholeCountry')}
                          </span>
                          <span className="text-caption text-muted">
                            {opsDate(advisory.effectiveFrom, locale)} →{' '}
                            {opsDate(advisory.expiresAt, locale)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[advisory.displayStatus]}>
                          {t(`statuses.${advisory.displayStatus}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-4 text-caption text-muted">{t('footnote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
