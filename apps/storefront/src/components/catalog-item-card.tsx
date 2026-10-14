import type { InventoryItemDto } from '@ota/schemas';
import { buttonClassName, Icon } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';

/**
 * A live catalogue item on a destination page (Destination board's
 * experience and stay cards): its photo, name, description and base price.
 * Durations, group sizes and per-person prices are not in the catalogue yet;
 * "Add to trip" opens the custom builder, where items are chosen.
 */
export function CatalogItemCard({
  item,
  builder,
}: {
  item: InventoryItemDto;
  builder: boolean;
}) {
  const t = useTranslations('destinations.detail');
  const common = useTranslations('pages.common');
  const types = useTranslations('catalog.types');
  const locale = useLocale();
  const photo = item.media[0];

  return (
    <article className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-surface shadow-sm">
      <div className="relative flex aspect-video items-center justify-center bg-sunken text-muted">
        {photo ? (
          <img
            src={`/api/ota/catalog/media/${photo.id}`}
            alt={photo.altText ?? ''}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="flex items-center gap-2 text-body-sm">
            <Icon name="image" />
            {common('photoToCome')}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-4">
        <p className="text-overline uppercase text-muted">{types(item.type)}</p>
        <h3 className="text-h4 text-default">{item.name}</h3>
        {item.description ? (
          <p className="text-body-sm text-secondary">{item.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-body-sm text-secondary">
            {t('fromPrice', {
              price: formatMoney(item.basePrice, item.currency, locale),
            })}
          </p>
          {builder ? (
            <Link
              href="/custom"
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              {t('addToTrip')}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
