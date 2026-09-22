import { isFeatureEnabled } from '@ota/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import Link from 'next/link';

import { getCatalog } from '@/lib/catalog';
import { getTenantConfig } from '@/lib/tenant';

const ctaPrimary =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90';
const ctaSecondary =
  'inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground';

export default async function HomePage() {
  const tenant = getTenantConfig();
  const catalog = await getCatalog();
  const featured = catalog.slice(0, 3);

  return (
    <div>
      <section className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-sm font-medium text-primary">Community-based travel · Cuba</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          {tenant.branding.agencyName}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Ecotourism, agrotourism, and cultural immersion beyond the resort circuits —
          curated with Cuban communities.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/catalog" className={ctaPrimary}>
            Explore experiences
          </Link>
          {isFeatureEnabled(tenant, 'customItineraryBuilder') ? (
            <Link href="/build" className={ctaSecondary}>
              Build an itinerary
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-xl font-semibold tracking-tight">Featured</h2>
        {featured.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            The catalog is being prepared. Check back soon.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  <CardDescription>
                    {item.province ?? 'Cuba'} · {item.type.replaceAll('_', ' ')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-medium">
                  {item.currency} {Number(item.basePrice).toFixed(2)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
