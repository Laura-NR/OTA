import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { AdvisoryEditor } from '@/components/advisory-editor';
import { PageHeader } from '@/components/page-header';
import { advisoryProvinces, advisoryRegionGroups } from '@/lib/advisory-regions';
import { getTenantConfig } from '@/lib/tenant';

/** A new advisory draft (A-Content editor). */
export default async function NewAdvisoryPage() {
  const t = await getTranslations('advisoriesDesk');
  const tenant = getTenantConfig();
  const sourceLocale = tenant.supportedLocales.includes('en')
    ? 'en'
    : tenant.primaryLocale;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/content/advisories" className="text-body-sm text-primary-600">
        {t('back')}
      </Link>
      <PageHeader title={t('newTitle')} description={t('description')} />
      <AdvisoryEditor
        advisory={null}
        locales={tenant.supportedLocales}
        defaultSourceLocale={sourceLocale}
        provinces={advisoryProvinces()}
        groups={advisoryRegionGroups()}
        serverNow={new Date().toISOString()}
      />
    </div>
  );
}
