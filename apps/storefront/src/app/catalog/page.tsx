import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@ota/ui';
import Link from 'next/link';

import { getCatalog, type CatalogFilters } from '@/lib/catalog';

const TYPES = [
  { value: undefined, label: 'All' },
  { value: 'ACCOMMODATION', label: 'Stays' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'EXPERIENCE', label: 'Experiences' },
] as const;

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
  const [items, all] = await Promise.all([getCatalog(filters), getCatalog()]);
  const provinces = [
    ...new Set(
      all.map((item) => item.province).filter((value): value is string => Boolean(value)),
    ),
  ].sort();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Experiences</h1>
      <p className="mt-2 text-muted-foreground">
        {items.length} curated option(s) across Cuba.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {TYPES.map((option) => (
          <Link
            key={option.label}
            href={catalogHref({ type: option.value, province })}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              type === option.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-accent',
            )}
          >
            {option.label}
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
            All provinces
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
        <p className="mt-6 text-sm text-muted-foreground">
          No matching experiences right now. Try another filter.
        </p>
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
                  {item.province ?? 'Cuba'} · {item.type.replaceAll('_', ' ')}
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
