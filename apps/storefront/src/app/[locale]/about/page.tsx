import { isFeatureEnabled } from '@ota/config';
import { contentPageSchema } from '@ota/schemas';
import { buttonClassName, cn } from '@ota/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ContentPageView } from '@/components/content/content-page';
import { Link } from '@/i18n/navigation';
import { getPageContent } from '@/lib/content';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('footer');
  return { title: t('about') };
}

/**
 * About (About board). The agency's story is tenant content; the licence line
 * comes from the manifest, and the calls to action link to pages that exist.
 */
export default async function AboutPage() {
  const content = await getPageContent('about', contentPageSchema);
  if (!content) {
    notFound();
  }
  const tenant = getTenantConfig();
  const t = await getTranslations('pages.about');

  return (
    <ContentPageView content={content} agencyName={tenant.branding.agencyName}>
      {isFeatureEnabled(tenant, 'recruitmentPortal') ? (
        <section aria-labelledby="join-title" className="flex flex-col gap-3">
          <h2 id="join-title" className="text-h3">
            {t('joinTitle')}
          </h2>
          <Link
            href="/join-our-network"
            className={cn(buttonClassName({ variant: 'secondary' }), 'self-start')}
          >
            {t('join')}
          </Link>
        </section>
      ) : null}
      <section aria-labelledby="licences-title" className="flex flex-col gap-2">
        <h2 id="licences-title" className="text-h3">
          {t('licencesTitle')}
        </h2>
        <p className="text-body">
          {t('licenceLine', {
            agency: tenant.branding.agencyName,
            license: tenant.branding.licenseNumber,
          })}
        </p>
        <p className="text-body-sm text-muted">{t('licenceNote')}</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/packages" className={buttonClassName()}>
          {t('seeTrips')}
        </Link>
        <Link href="/support" className={buttonClassName({ variant: 'secondary' })}>
          {t('talkToUs')}
        </Link>
      </div>
    </ContentPageView>
  );
}
