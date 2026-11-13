import { cubaProvinceName } from '@ota/domain';
import type { EventDto } from '@ota/schemas';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { OverrideNotice } from '@/components/override-notice';
import { deskAccess } from '@/lib/overrides';
import { EventActions } from '@/components/event-actions';
import { EventEditor } from '@/components/event-editor';
import { EventTranslations } from '@/components/event-translations';
import { PageHeader } from '@/components/page-header';
import { advisoryProvinces } from '@/lib/advisory-regions';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { EVENT_ACCESS_BADGE, EVENT_STATUS_BADGE, eventDates } from '@/lib/events';
import { getTenantConfig } from '@/lib/tenant';

/**
 * One event (A-Content, M10): the editor, the per-locale text, the publish
 * checks and the publish, archive and delete actions. Support reads it.
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, locale, session] = await Promise.all([
    getTranslations('eventsDesk'),
    getLocale(),
    getServerSession(),
  ]);
  const event = await apiFetch<EventDto>(`/events/${id}`).catch((error) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  });
  if (!event) {
    notFound();
  }
  const tenant = getTenantConfig();
  const access = await deskAccess(session?.user.role, 'catalog');
  const canManage = access.canManage;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/content/events" className="text-body-sm text-primary-600">
        {t('back')}
      </Link>
      <PageHeader
        title={event.name}
        description={`${eventDates(event, locale, t('datesTbc'))} · ${cubaProvinceName(event.province)}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={EVENT_ACCESS_BADGE[event.access]}>
            {t(`access.${event.access}`)}
          </Badge>
          <Badge variant={EVENT_STATUS_BADGE[event.status]}>
            {t(`statuses.${event.status}`)}
          </Badge>
        </div>
      </PageHeader>
      <OverrideNotice capability="catalog" overrides={access.overrides} />

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1fr_20rem] xl:items-start">
        <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-6 xl:order-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('publishing.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-body-sm">
              <p>
                {t('publishing.requests', {
                  open: event.openRequestCount,
                  total: event.requestCount,
                })}{' '}
                {event.requestCount > 0 ? (
                  <Link
                    href={`/bookings/event-requests?eventId=${event.id}`}
                    className="text-primary-600 underline-offset-4 hover:underline"
                  >
                    {t('publishing.seeRequests')}
                  </Link>
                ) : null}
              </p>
              {event.publishIssues.length > 0 ? (
                <Alert variant="warning">
                  <ul className="flex flex-col gap-1">
                    {event.publishIssues.map((issue) => (
                      <li key={issue}>{t(`issues.${issue}`)}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <p className="text-muted">{t('publishing.ready')}</p>
              )}
              {event.status === 'PUBLISHED' ? (
                <p className="text-muted">{t('publishing.live', { slug: event.slug })}</p>
              ) : null}
              {canManage ? (
                <EventActions event={event} />
              ) : (
                <p className="text-caption text-muted">{t('readOnly')}</p>
              )}
            </CardContent>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          {canManage ? (
            <EventEditor
              key={event.updatedAt}
              event={event}
              locales={tenant.supportedLocales}
              defaultSourceLocale={event.sourceLocale}
              provinces={advisoryProvinces()}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-6 text-body-sm">
                <p>{event.summary}</p>
                <p className="text-muted">{event.place}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t('translations.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EventTranslations
                key={
                  event.updatedAt + event.translations.map((row) => row.updatedAt).join()
                }
                event={event}
                locales={tenant.supportedLocales}
                canManage={canManage}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
