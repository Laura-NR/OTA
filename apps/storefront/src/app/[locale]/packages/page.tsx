import { isFeatureEnabled } from '@ota/config';
import { packagesContentSchema } from '@ota/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Breadcrumb } from '@/components/breadcrumb';
import { PageIntro } from '@/components/content/page-intro';
import { PackagesBrowser } from '@/components/packages/packages-browser';
import { getPageContent } from '@/lib/content';
import { parsePackageQuery } from '@/lib/package-query';
import { getPackages } from '@/lib/packages';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('packages') };
}

/**
 * Packages (Packages / M-Packages boards): the live curated catalogue with
 * filters, sort and the compare tray. Home's search and the Destinations
 * panel land here with their filters in the URL (`?q=`, `?province=`).
 */
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = getTenantConfig();
  const [params, content, packages, t, nav] = await Promise.all([
    searchParams,
    getPageContent('packages', packagesContentSchema),
    getPackages(),
    getTranslations('packages'),
    getTranslations('nav'),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-8 px-6 py-8 md:px-8 lg:px-10">
      <Breadcrumb
        label={t('breadcrumb')}
        items={[{ label: nav('home'), href: '/' }, { label: nav('packages') }]}
      />
      <PageIntro
        status={content?.status ?? 'published'}
        title={content?.title ?? t('title')}
        lede={content?.lede ?? t('description')}
        agencyName={tenant.branding.agencyName}
      />
      {packages.length === 0 ? (
        <p className="text-body text-secondary">{t('empty')}</p>
      ) : (
        <PackagesBrowser
          packages={packages}
          initial={parsePackageQuery(params)}
          instant={isFeatureEnabled(tenant, 'instantBooking')}
          custom={
            isFeatureEnabled(tenant, 'customItineraryBuilder')
              ? (content?.custom ?? null)
              : null
          }
        />
      )}
    </div>
  );
}
