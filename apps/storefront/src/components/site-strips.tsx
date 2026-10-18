import { conditionsContentSchema, eventBannerContentSchema } from '@ota/schemas';
import { Badge, buttonClassName, cn, Icon } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';

import { Link } from '@/i18n/navigation';
import { getActiveAdvisories, getAcknowledgedAdvisories } from '@/lib/advisories';
import { DISMISSED_ADVISORIES_COOKIE, parseDismissed } from '@/lib/advisory-cookie';
import { getPageContent } from '@/lib/content';

import { AdvisoryBanner } from './advisory-banner';
import { RouteGate } from './route-gate';

const wrap = 'mx-auto flex max-w-container items-center px-6 md:px-8 lg:px-10';

/**
 * "Cuba right now" (Home, Destinations, Packages boards): info 100 above the
 * header, one line on a phone. Tenant content until A-Content publishes it; a
 * placeholder carries a "Sample" badge so nobody plans around it.
 */
async function ConditionsStrip() {
  const content = await getPageContent('conditions', conditionsContentSchema);
  if (!content) {
    return null;
  }
  const t = await getTranslations();

  return (
    <div className="bg-info-100 text-info-700">
      <div className={cn(wrap, 'gap-3 py-2 text-body-sm')}>
        <Icon name="info" className="shrink-0" />
        <p className="min-w-0 flex-1 truncate md:whitespace-normal">
          <strong className="font-semibold">{content.strip.headline}</strong>{' '}
          {content.strip.text}
        </p>
        {content.status === 'placeholder' ? (
          <Badge variant="outline">{t('pages.common.sample')}</Badge>
        ) : null}
        <Link
          href="/travel-info"
          className="whitespace-nowrap font-semibold underline underline-offset-[3px]"
        >
          {/* A phone shows the board's "More"; the full name stays for screen readers. */}
          <span className="md:hidden">{t('conditions.more')} </span>
          <span className="sr-only md:not-sr-only">{t('conditions.link')}</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * The event strip (Home board; spec §3.2's promotional banner) on neutral
 * 900. Its request goes to the Support form until Concierge exists (M10).
 */
async function EventBanner() {
  const content = await getPageContent('event', eventBannerContentSchema);
  if (!content) {
    return null;
  }
  const t = await getTranslations('pages.common');

  return (
    <div className="bg-neutral-900 text-neutral-0">
      <div className={cn(wrap, 'gap-4 py-2.5 text-body-sm')}>
        <Badge variant="accent">{content.label}</Badge>
        {content.status === 'placeholder' ? (
          <Badge variant="secondary">{t('sample')}</Badge>
        ) : null}
        <p className="min-w-0 flex-1 truncate md:whitespace-normal">
          <strong className="font-semibold">{content.headline}</strong>{' '}
          <span className="hidden md:inline">{content.text}</span>
        </p>
        <Link
          href="/support#contact"
          className={cn(
            buttonClassName({ variant: 'secondary', size: 'sm' }),
            'hidden border-transparent text-neutral-900 focus-visible:outline-accent-500 md:inline-flex',
          )}
        >
          {content.cta}
        </Link>
        <Link
          href="/support#contact"
          aria-label={content.cta}
          className="text-accent-500 focus-visible:outline-accent-500 md:hidden"
        >
          <Icon name="chevron-right" />
        </Link>
      </div>
    </div>
  );
}

/**
 * The strips above the header; each shows only on the pages that draw it. An
 * active site advisory (M7) shows on every page and takes the conditions
 * strip's place, so two info strips never stack.
 */
export async function SiteStrips({
  events,
  signedIn,
}: {
  events: boolean;
  signedIn: boolean;
}) {
  const [locale, store, t] = await Promise.all([
    getLocale(),
    cookies(),
    getTranslations('advisories'),
  ]);
  const dismissed = parseDismissed(store.get(DISMISSED_ADVISORIES_COOKIE)?.value);
  const advisories = (await getActiveAdvisories(locale)).filter(
    (advisory) =>
      advisory.showOnSite &&
      (advisory.severity === 'CRITICAL' || !dismissed.includes(advisory.id)),
  );
  const acknowledged =
    signedIn && advisories.some((advisory) => advisory.severity === 'CRITICAL')
      ? await getAcknowledgedAdvisories()
      : [];

  return (
    <>
      {advisories.length > 0 ? (
        <AdvisoryBanner
          advisories={advisories.map(({ id, severity, headline, body, cta }) => ({
            id,
            severity,
            headline,
            body,
            cta,
          }))}
          acknowledged={acknowledged}
          signedIn={signedIn}
          labels={{
            label: t('label'),
            dismiss: t('dismiss'),
            acknowledge: t('acknowledge'),
            reopen: t('reopen'),
            details: t('details'),
          }}
        />
      ) : (
        <RouteGate only="planning">
          <ConditionsStrip />
        </RouteGate>
      )}
      {events ? (
        <RouteGate only="home">
          <EventBanner />
        </RouteGate>
      ) : null}
    </>
  );
}
