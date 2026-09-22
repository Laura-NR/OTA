import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { CubaMap } from '@/components/cuba-map';
import { Link } from '@/i18n/navigation';
import { getCatalog, type CatalogFilters } from '@/lib/catalog';

const TYPES = ['ACCOMMODATION', 'TRANSPORT', 'EXPERIENCE'] as const;

function catalogHref(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.province) params.set('province', filters.province);
  const query = params.toString();
  return query ? `/catalog?${query}` : '/catalog';
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; province?: string }>;
}) {
  const { type, province } = await searchParams;
  const filters: CatalogFilters = { type, province };
  const t = await getTranslations('catalog');
  const [items, all] = await Promise.all([getCatalog(filters), getCatalog()]);
  const provinces = [
    ...new Set(
      all.map((item) => item.province).filter((value): value is string => Boolean(value)),
    ),
  ].sort();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <Link
          href="/build"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('build')}
        </Link>
      </div>
      <p className="mt-2 text-muted-foreground">{t('count', { count: items.length })}</p>

      <div className="mt-6 rounded-lg border bg-card p-2">
        <CubaMap availableProvinces={provinces} selectedProvince={province} type={type} />
        <p className="px-2 pb-1 text-xs text-muted-foreground">{t('mapHint')}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={catalogHref({ type: undefined, province })}
          className={cn(
            'rounded-full border px-3 py-1 text-sm transition-colors',
            !type
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input hover:bg-accent',
          )}
        >
          {t('all')}
        </Link>
        {TYPES.map((option) => (
          <Link
            key={option}
            href={catalogHref({ type: option, province })}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              type === option
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-accent',
            )}
          >
            {t(`types.${option}`)}
          </Link>
        ))}
      </div>

      {provinces.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={catalogHref({ type })}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              !province
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-accent',
            )}
          >
            {t('allProvinces')}
          </Link>
          {provinces.map((value) => (
            <Link
              key={value}
              href={catalogHref({ type, province: value })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                province === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input hover:bg-accent',
              )}
            >
              {value}
            </Link>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              {item.media[0] ? (
                <img
                  src={`/api/ota/catalog/media/${item.media[0].id}`}
                  alt={item.media[0].altText ?? item.name}
                  className="h-40 w-full object-cover"
                />
              ) : null}
              <CardHeader>
                <CardTitle className="text-base">{item.name}</CardTitle>
                <CardDescription>
                  {item.province ?? t('provinceFallback')} · {t(`types.${item.type}`)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {item.description ? (
                  <p className="mb-3 text-sm text-muted-foreground">{item.description}</p>
                ) : null}
                <p className="text-sm font-medium">
                  {item.currency} {Number(item.basePrice).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
