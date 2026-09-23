import { Badge, Card, CardContent, CardHeader, CardTitle } from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PackageBookingForm } from '@/components/package-booking-form';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/api';
import { getPackage } from '@/lib/packages';

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [pkg, session, t] = await Promise.all([
    getPackage(slug),
    getServerSession(),
    getTranslations('packages'),
  ]);

  if (!pkg) {
    notFound();
  }

  const days = [...new Set(pkg.services.map((service) => service.dayOffset))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Link
        href="/packages"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t('back')}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{pkg.name}</h1>
        <Badge variant="outline">{t('days', { count: pkg.durationDays })}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground">
        {[pkg.province, t('days', { count: pkg.durationDays })]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {pkg.description ? (
        <p className="mt-3 max-w-3xl text-muted-foreground">{pkg.description}</p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('included')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {days.map((day) => (
              <div key={day} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('day', { day: day + 1 })}
                </p>
                <ul className="space-y-2 text-sm">
                  {pkg.services
                    .filter((service) => service.dayOffset === day)
                    .map((service) => (
                      <li
                        key={service.id}
                        className="flex justify-between gap-3 rounded-md border p-3"
                      >
                        <span className="font-medium">{service.itemName}</span>
                        <span className="text-muted-foreground">
                          {service.itemProvince ?? ''}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        <PackageBookingForm
          packageId={pkg.id}
          slug={pkg.slug}
          signedIn={Boolean(session)}
          priceLabel={t('from', {
            currency: pkg.currency,
            amount: Number(pkg.basePrice).toFixed(2),
          })}
        />
      </div>
    </div>
  );
}
