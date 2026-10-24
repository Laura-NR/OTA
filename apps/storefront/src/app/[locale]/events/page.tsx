import { cubaProvinceName } from '@ota/domain';
import { eventsPageContentSchema } from '@ota/schemas';
import { Badge, buttonClassName, cn, EmptyState } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { Breadcrumb } from '@/components/breadcrumb';
import { PageIntro } from '@/components/content/page-intro';
import { Link } from '@/i18n/navigation';
import { getPageContent } from '@/lib/content';
import { eventDateLine } from '@/lib/event-dates';
import { getEvents } from '@/lib/events';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('events');
  return { title: t('metaTitle') };
}

/**
 * "All events" (Concierge board, M10 D2): what the concierge can request this
 * season, soonest first, each with its dates and access, and the way in.
 */
export default async function EventsPage() {
  const [t, nav, locale, events, content] = await Promise.all([
    getTranslations('events'),
    getTranslations('nav'),
    getLocale(),
    getEvents(),
    getPageContent('events', eventsPageContentSchema),
  ]);
  const tenant = getTenantConfig();

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-8 px-4 py-8 sm:px-6 md:px-8 md:py-10 lg:px-10">
      <Breadcrumb
        label={t('breadcrumb')}
        items={[{ label: nav('home'), href: '/' }, { label: nav('events') }]}
      />
      <PageIntro
        status={content?.status ?? 'published'}
        eyebrow={content?.eyebrow ?? t('eyebrow')}
        title={content?.title ?? t('title')}
        lede={content?.lede}
        note={t('datesNote')}
        agencyName={tenant.branding.agencyName}
      />

      {events.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <li key={event.slug} className="flex min-w-0">
              <article className="flex w-full flex-col gap-3 rounded-lg border bg-surface p-5 shadow-sm">
                <p className="text-body-sm font-medium text-secondary-600">
                  {eventDateLine(event, locale, t('datesTbc'))}
                </p>
                <h2 className="font-display text-h2-compact text-default">
                  <Link
                    href={`/events/${event.slug}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {event.name}
                  </Link>
                </h2>
                <p className="text-body-sm text-muted">
                  {event.place} · {cubaProvinceName(event.province)}
                </p>
                <Badge
                  variant={event.access === 'GUIDE_ONLY' ? 'secondary' : 'info'}
                  className="self-start"
                >
                  {t(`access.${event.access}`)}
                </Badge>
                <p className="line-clamp-3 text-body text-secondary">{event.summary}</p>
                <Link
                  href={`/events/${event.slug}`}
                  className={cn(
                    buttonClassName({
                      variant: event.access === 'GUIDE_ONLY' ? 'secondary' : 'primary',
                    }),
                    'mt-auto self-start',
                  )}
                >
                  {event.access === 'GUIDE_ONLY' ? t('planTrip') : t('requestAccess')}
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
