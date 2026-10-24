import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { EventEditor } from '@/components/event-editor';
import { PageHeader } from '@/components/page-header';
import { advisoryProvinces } from '@/lib/advisory-regions';
import { getTenantConfig } from '@/lib/tenant';

/** A new event (A-Content, M10 D1), saved as a draft. */
export default async function NewEventPage() {
  const t = await getTranslations('eventsDesk');
  const tenant = getTenantConfig();
  const sourceLocale = tenant.supportedLocales.includes('en')
    ? 'en'
    : tenant.primaryLocale;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/content/events" className="text-body-sm text-primary-600">
        {t('back')}
      </Link>
      <PageHeader title={t('newTitle')} description={t('description')} />
      <EventEditor
        event={null}
        locales={tenant.supportedLocales}
        defaultSourceLocale={sourceLocale}
        provinces={advisoryProvinces()}
      />
    </div>
  );
}
