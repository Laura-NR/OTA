import { isFeatureEnabled } from '@ota/config';
import {
  buttonClassName,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { getCatalog } from '@/lib/catalog';
import { getTenantConfig } from '@/lib/tenant';

const ctaPrimary = buttonClassName();
const ctaSecondary = buttonClassName({ variant: 'secondary' });

export default async function HomePage() {
  const tenant = getTenantConfig();
  const t = await getTranslations('home');
  const tc = await getTranslations('catalog');
  const catalog = await getCatalog();
  const featured = catalog.slice(0, 3);

  return (
    <div>
      <section className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-body-sm font-medium text-primary-600">{t('eyebrow')}</p>
        <h1 className="mt-2 text-h1 font-semibold tracking-tight sm:text-display-2">
          {tenant.branding.agencyName}
        </h1>
        <p className="mt-4 max-w-2xl text-body-lg text-muted">{t('description')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/catalog" className={ctaPrimary}>
            {t('explore')}
          </Link>
          {isFeatureEnabled(tenant, 'customItineraryBuilder') ? (
            <Link href="/build" className={ctaSecondary}>
              {t('build')}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-h4 font-semibold tracking-tight">{t('featured')}</h2>
        {featured.length === 0 ? (
          <p className="mt-3 text-body-sm text-muted">{t('preparing')}</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="text-body">{item.name}</CardTitle>
                  <CardDescription>
                    {item.province ?? 'Cuba'} · {tc(`types.${item.type}`)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-body-sm font-medium">
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
