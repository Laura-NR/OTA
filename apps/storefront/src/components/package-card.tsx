import { packageProvinces } from '@ota/domain';
import type { PackageDto } from '@ota/schemas';
import { Badge, buttonClassName, cn, Icon } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';

/** How many of a package's services the card lists as highlights. */
const HIGHLIGHTS = 3;

/** The first catalogue photo among a package's services, if any has one. */
export function packageMediaId(pkg: PackageDto): string | null {
  return pkg.services.find((service) => service.itemMediaId)?.itemMediaId ?? null;
}

/** "3 days · 2 nights", the overline the trip cards and the Package hero share. */
export function useTripLength(days: number): string {
  const t = useTranslations('packages');
  const nights = days - 1;
  return nights > 0
    ? `${t('days', { count: days })} · ${t('nights', { count: nights })}`
    : t('days', { count: days });
}

/**
 * "Request · 24 h", or "Instant" when the tenant confirms bookings at once. The
 * booking model is tenant-wide until packages carry their own (M1).
 */
export function BookingModelPill({ instant }: { instant: boolean }) {
  const t = useTranslations('packages');
  return instant ? (
    <Badge className="bg-action-primary text-on-primary">
      <Icon name="zap" className="h-3.5 w-3.5" />
      {t('instantPill')}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-primary-600 text-primary-700">
      <Icon name="clock" className="h-3.5 w-3.5" />
      {t('requestPill')}
    </Badge>
  );
}

/**
 * A trip card (Home "Featured trips", Packages): photo, length, the provinces
 * it visits, its first services as highlights, the price and the booking
 * model. Ratings, categories and the per-person split wait for the package
 * model (M1) and reviews; `compare` slots the Packages compare toggle beside
 * the primary action.
 */
export function PackageCard({
  pkg,
  instant,
  compare,
}: {
  pkg: PackageDto;
  instant: boolean;
  compare?: ReactNode;
}) {
  const t = useTranslations('packages');
  const common = useTranslations('pages.common');
  const locale = useLocale();
  const length = useTripLength(pkg.durationDays);
  const mediaId = packageMediaId(pkg);
  const highlights = [...new Set(pkg.services.map((service) => service.itemName))].slice(
    0,
    HIGHLIGHTS,
  );
  const href = `/packages/${pkg.slug}`;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative flex aspect-video items-center justify-center bg-sunken text-muted">
        {mediaId ? (
          <img
            src={`/api/ota/catalog/media/${mediaId}`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="flex items-center gap-2 text-body-sm">
            <Icon name="image" />
            {common('photoToCome')}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4">
        <div className="flex flex-col gap-1">
          <p className="text-overline uppercase text-muted">{length}</p>
          <h3 className="font-display text-h2-compact text-default">
            <Link href={href} className="hover:text-primary-700">
              {pkg.name}
            </Link>
          </h3>
          <p className="text-body-sm text-secondary">
            {packageProvinces(pkg).join(' · ') || 'Cuba'}
          </p>
        </div>
        {highlights.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2 text-body-sm text-secondary">
                <Icon name="check" className="mt-0.5 h-4 w-4 text-success-600" />
                {highlight}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 border-t pt-2">
          <div>
            <p className="text-caption text-muted">{t('fromLabel')}</p>
            <p className="text-h2-compact font-body font-bold text-default">
              {formatMoney(pkg.basePrice, pkg.currency, locale)}
            </p>
          </div>
          <BookingModelPill instant={instant} />
        </div>
        <div className="flex gap-2">
          <Link href={href} className={cn(buttonClassName(), 'flex-1')}>
            {t('viewTrip')}
          </Link>
          {compare}
        </div>
      </div>
    </article>
  );
}
