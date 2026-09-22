'use client';

import { cn } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import { CUBA_PROVINCES } from '@/lib/cuba-provinces';

/**
 * Tokenized interactive map of Cuba (spec §4 storefront). Each province is a
 * button: provinces with catalog items are highlighted, the selected province is
 * filled with the tenant primary colour, and selecting one filters `/catalog`.
 */
export function CubaMap({
  availableProvinces,
  selectedProvince,
  type,
}: {
  availableProvinces: string[];
  selectedProvince?: string;
  type?: string;
}) {
  const t = useTranslations('catalog');
  const router = useRouter();
  const available = new Set(availableProvinces);

  function selectProvince(name: string) {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (name !== selectedProvince) params.set('province', name);
    const query = params.toString();
    router.push(query ? `/catalog?${query}` : '/catalog');
  }

  return (
    <svg
      viewBox="0 0 1000 342"
      role="group"
      aria-label={t('mapAria')}
      className="h-auto w-full"
    >
      {CUBA_PROVINCES.map((province) => {
        const isAvailable = available.has(province.name);
        const isSelected = province.name === selectedProvince;
        return (
          <path
            key={province.id}
            d={province.d}
            role="button"
            tabIndex={0}
            aria-label={province.name}
            aria-pressed={isSelected}
            onClick={() => selectProvince(province.name)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectProvince(province.name);
              }
            }}
            className={cn(
              'cursor-pointer stroke-border stroke-[0.5] transition-colors focus:outline-none focus-visible:stroke-2 focus-visible:stroke-primary',
              isSelected
                ? 'fill-primary'
                : isAvailable
                  ? 'fill-primary/25 hover:fill-primary/50'
                  : 'fill-muted hover:fill-muted-foreground/30',
            )}
          />
        );
      })}
    </svg>
  );
}
