import { searchPackages } from '@ota/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { getPackages } from '@/lib/packages';

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const t = await getTranslations('packages');
  // Home's search lands here with `q`.
  const packages = searchPackages(await getPackages(), { query: q });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-h2 font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-muted">{t('description')}</p>
      <p className="mt-1 text-body-sm text-muted">
        {t('count', { count: packages.length })}
      </p>

      {packages.length === 0 ? (
        <p className="mt-6 text-body-sm text-muted">{t('empty')}</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => {
            const mediaId = pkg.services.find(
              (service) => service.itemMediaId,
            )?.itemMediaId;
            return (
              <Link key={pkg.id} href={`/packages/${pkg.slug}`} className="group">
                <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-sm">
                  {mediaId ? (
                    <img
                      src={`/api/ota/catalog/media/${mediaId}`}
                      alt={pkg.name}
                      className="h-40 w-full object-cover"
                    />
                  ) : null}
                  <CardHeader>
                    <CardTitle className="text-body">{pkg.name}</CardTitle>
                    <CardDescription>
                      {[pkg.province, t('days', { count: pkg.durationDays })]
                        .filter(Boolean)
                        .join(' · ')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pkg.description ? (
                      <p className="text-body-sm text-muted">{pkg.description}</p>
                    ) : null}
                    <p className="text-body-sm font-medium">
                      {t('from', {
                        currency: pkg.currency,
                        amount: Number(pkg.basePrice).toFixed(2),
                      })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
