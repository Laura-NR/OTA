import { UserRole, cubaProvinceName } from '@ota/domain';
import type { EventListItemDto } from '@ota/schemas';
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
import { EVENT_ACCESS_BADGE, EVENT_STATUS_BADGE, eventDates } from '@/lib/events';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/**
 * A-Content's events tab (M10 D1): every event the concierge can request seats
 * for, with its dates, access, status and the requests it holds.
 */
export default async function EventsPage() {
  const [t, locale, session] = await Promise.all([
    getTranslations('eventsDesk'),
    getLocale(),
    getServerSession(),
  ]);
  const events = await apiFetch<EventListItemDto[]>('/events').catch(() => []);
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')}>
        {canManage ? (
          <Link href="/content/events/new" className={buttonClassName({})}>
            {t('new')}
          </Link>
        ) : null}
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          {events.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('event')}</TableHead>
                    <TableHead>{t('dates')}</TableHead>
                    <TableHead>{t('accessColumn')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead className="text-right">{t('requests')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="min-w-[16rem]">
                        <div className="flex flex-col">
                          <Link
                            href={`/content/events/${event.id}`}
                            className="font-medium text-primary-600 underline-offset-4 hover:underline"
                          >
                            {event.name}
                          </Link>
                          <span className="text-caption text-muted">
                            {cubaProvinceName(event.province)} ·{' '}
                            <span className="font-mono">{event.slug}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {eventDates(event, locale, t('datesTbc'))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={EVENT_ACCESS_BADGE[event.access]}>
                          {t(`access.${event.access}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={EVENT_STATUS_BADGE[event.status]}>
                          {t(`statuses.${event.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">
                        {t('requestCount', {
                          open: event.openRequestCount,
                          total: event.requestCount,
                        })}
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
