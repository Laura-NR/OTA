import { Badge, Icon } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import type { DestinationView } from '@/lib/geography';

/** The backup-power pill: green when settled, amber when it needs planning. */
export function PowerPill({ destination }: { destination: DestinationView }) {
  return (
    <Badge variant={destination.power === 'ok' ? 'success' : 'warning'}>
      <Icon name="zap" className="h-3.5 w-3.5" />
      {destination.powerLabel}
    </Badge>
  );
}

function PhotoToCome({ alt }: { alt: string }) {
  const t = useTranslations('pages.common');
  return (
    <span
      role="img"
      aria-label={alt}
      className="absolute inset-0 flex items-center justify-center gap-2 text-body-sm text-muted"
    >
      <Icon name="image" />
      <span aria-hidden="true" className="max-sm:hidden">
        {t('photoToCome')}
      </span>
    </span>
  );
}

/**
 * A destination (Destinations grid, Home tiles). `card`: photo, then the
 * name, tagline, theme and power pills, and the live trips with their lowest
 * price. `tile`: Home's photo tile with the words on a light panel and the
 * province's advisory level.
 */
export function DestinationCard({
  destination,
  variant = 'card',
  advisoryLevel,
}: {
  destination: DestinationView;
  variant?: 'card' | 'tile';
  advisoryLevel?: number;
}) {
  const t = useTranslations('destinations');
  const locale = useLocale();
  const href = `/destinations/${destination.slug}`;
  const trips = t('packagesCount', { count: destination.packageCount });

  if (variant === 'tile') {
    return (
      <Link
        href={href}
        className="relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-lg bg-sunken p-4 transition hover:shadow-md"
      >
        <PhotoToCome alt={destination.alt} />
        <span className="relative flex flex-col gap-1.5 rounded-md bg-surface/90 px-3.5 py-3">
          <span className="font-display text-h3 text-default">{destination.name}</span>
          <span className="text-body-sm text-secondary">
            {destination.tagline} · {trips}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {advisoryLevel ? (
              <Badge variant="info">{t('levelShort', { level: advisoryLevel })}</Badge>
            ) : null}
            <PowerPill destination={destination} />
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`${destination.name}: ${destination.tagline}`}
      className="flex w-full min-w-0 overflow-hidden rounded-lg border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:flex-col"
    >
      <span className="relative block w-[120px] shrink-0 bg-sunken sm:aspect-[4/3] sm:w-auto">
        <PhotoToCome alt={destination.alt} />
        <Badge className="absolute bottom-2.5 left-2.5 bg-surface/90 text-neutral-700 max-sm:max-w-[100px] max-sm:truncate sm:bottom-auto sm:top-2.5">
          {destination.provinceName}
        </Badge>
        {destination.limited ? (
          <Badge variant="warning" className="absolute right-2.5 top-2.5">
            {t('limitedPill')}
          </Badge>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 sm:px-5 sm:pb-5 sm:pt-4">
        <span className="font-display text-h2-compact text-default sm:text-h3">
          {destination.name}
        </span>
        <span className="text-body-sm text-secondary">{destination.tagline}</span>
        <span className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="secondary" className="max-sm:hidden">
            {destination.themeLabel}
          </Badge>
          <PowerPill destination={destination} />
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-body-sm">
          <span className="text-secondary">
            {trips}
            <span className="max-sm:hidden"> · {destination.stays}</span>
          </span>
          <span className="whitespace-nowrap font-semibold text-default">
            {destination.fromPrice
              ? t('fromPrice', {
                  price: formatMoney(
                    destination.fromPrice.amount,
                    destination.fromPrice.currency,
                    locale,
                  ),
                })
              : t('onRequest')}
          </span>
        </span>
      </span>
    </Link>
  );
}
