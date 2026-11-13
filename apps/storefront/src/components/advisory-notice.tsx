import { CUBA_PROVINCE_NAMES } from '@ota/domain';
import type { PublicAdvisoryDto } from '@ota/schemas';
import { Alert, Badge, type AlertVariant, type BadgeVariant } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { advisoryDay } from '@/lib/advisories';

const ALERT: Record<PublicAdvisoryDto['severity'], AlertVariant> = {
  INFO: 'info',
  CAUTION: 'warning',
  CRITICAL: 'destructive',
};

const BADGE: Record<PublicAdvisoryDto['severity'], BadgeVariant> = {
  INFO: 'info',
  CAUTION: 'warning',
  CRITICAL: 'destructive',
};

function regions(advisory: PublicAdvisoryDto, whole: string): string {
  return advisory.regions.length > 0
    ? advisory.regions.map((code) => CUBA_PROVINCE_NAMES[code] ?? code).join(' · ')
    : whole;
}

/**
 * One advisory as a DS 03 alert: severity, headline, what to do, its regions,
 * window and source. Ended ones (the Current Conditions history) are quiet
 * cards with what ended them.
 */
export async function AdvisoryNotice({
  advisory,
  link = false,
}: {
  advisory: PublicAdvisoryDto;
  /** Adds the link to Travel info (package pages and the booking form). */
  link?: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations('advisories'), getLocale()]);
  const window = t('window', {
    from: advisoryDay(advisory.effectiveFrom, locale),
    to: advisoryDay(advisory.liftedAt ?? advisory.expiresAt, locale),
  });
  const meta = (
    <p className="mt-2 text-caption">
      {regions(advisory, t('wholeCountry'))} · {window} ·{' '}
      {t('source', { source: advisory.source })}
    </p>
  );
  const ended =
    advisory.displayStatus === 'EXPIRED' ||
    advisory.displayStatus === 'LIFTED' ||
    advisory.displayStatus === 'SUPERSEDED';

  if (ended) {
    return (
      <article className="rounded-md border bg-surface p-4 text-body-sm text-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`severities.${advisory.severity}`)}</Badge>
          <Badge variant="outline">
            {t(`ended.${advisory.displayStatus as 'EXPIRED' | 'LIFTED' | 'SUPERSEDED'}`)}
          </Badge>
        </div>
        <h3 className="mt-2 font-semibold text-default">{advisory.headline}</h3>
        <p className="mt-1">{advisory.body}</p>
        {meta}
      </article>
    );
  }

  return (
    <Alert
      variant={ALERT[advisory.severity]}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={BADGE[advisory.severity]}>
            {t(`severities.${advisory.severity}`)}
          </Badge>
          <span>{advisory.headline}</span>
        </span>
      }
    >
      <p>{advisory.body}</p>
      {meta}
      {link ? (
        <Link
          href="/travel-info#advisories"
          className="mt-2 inline-block font-semibold underline underline-offset-[3px]"
        >
          {advisory.cta ?? t('noticeMore')}
        </Link>
      ) : null}
    </Alert>
  );
}
