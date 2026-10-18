import { CUBA_PROVINCE_NAMES, UserRole } from '@ota/domain';
import type { DisruptionListItemDto } from '@ota/schemas';
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
import { apiFetch, getServerSession } from '@/lib/api';
import { DISRUPTION_SEVERITY_BADGE } from '@/lib/disruptions';
import { opsDate, opsTime } from '@/lib/ops-format';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/**
 * The Disruptions section (M8): every case with its severity, scenario and
 * affected bookings, open cases first. A case with a red "Unknown" or a call
 * due is tinted, and the reason is written in the row.
 */
export default async function DisruptionsPage() {
  const [t, locale, session] = await Promise.all([
    getTranslations('disruptionsDesk'),
    getLocale(),
    getServerSession(),
  ]);
  const cases = await apiFetch<DisruptionListItemDto[]>('/disruptions?limit=200').catch(
    () => [],
  );
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')}>
        {canManage ? (
          <Link href="/disruptions/new" className={buttonClassName({})}>
            {t('new')}
          </Link>
        ) : null}
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {cases.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('case')}</TableHead>
                    <TableHead>{t('severity')}</TableHead>
                    <TableHead>{t('affected')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((item) => {
                    const urgent =
                      item.status === 'OPEN' &&
                      (item.counts.overdueUnknown > 0 ||
                        item.counts.callNow > 0 ||
                        item.counts.needsHelp > 0);
                    return (
                      <TableRow key={item.id} tone={urgent ? 'attention' : undefined}>
                        <TableCell className="min-w-[16rem]">
                          <div className="flex flex-col">
                            <Link
                              href={`/disruptions/${item.id}`}
                              className="font-medium text-primary-600 underline-offset-4 hover:underline"
                            >
                              {item.title}
                            </Link>
                            <span className="text-caption text-muted">
                              <span className="font-mono">{item.reference}</span>
                              {' · '}
                              {item.scenarioLabel ?? item.scenario}
                              {' · '}
                              {item.province
                                ? (CUBA_PROVINCE_NAMES[item.province] ?? item.province)
                                : t('notRegional')}
                            </span>
                            <span className="text-caption text-muted">
                              {opsDate(item.openedAt, locale)}{' '}
                              {opsTime(item.openedAt, locale)}
                              {' · '}
                              {item.ownerName
                                ? t('owner', { name: item.ownerName })
                                : t('noOwner')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={DISRUPTION_SEVERITY_BADGE[item.severity]}>
                            {t(`severities.${item.severity}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[14rem]">
                          <div className="flex flex-col text-body-sm">
                            <span>
                              {t('affectedLine', {
                                count: item.counts.affected,
                                ground: item.counts.onTheGround,
                                arriving: item.counts.arriving,
                              })}
                            </span>
                            {item.status === 'OPEN' && item.counts.overdueUnknown > 0 ? (
                              <span className="font-medium text-error-700">
                                {t('overdueLine', { count: item.counts.overdueUnknown })}
                              </span>
                            ) : null}
                            {item.status === 'OPEN' && item.counts.callNow > 0 ? (
                              <span className="font-medium text-warning-700">
                                {t('callLine', { count: item.counts.callNow })}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={item.status === 'OPEN' ? 'attention' : 'secondary'}
                          >
                            {t(`statuses.${item.status}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
