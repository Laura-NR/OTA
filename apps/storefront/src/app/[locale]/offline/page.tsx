import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { RetryButton, SavedTrips } from '@/components/offline/saved-trips';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('offline');
  return { title: t('metaTitle'), robots: { index: false } };
}

/**
 * The offline page (DS 05; Phase 8 item 2). The service worker keeps one per
 * locale and shows it for any page the device has not saved while the
 * network is down: what still works (the saved trips, the emergency numbers)
 * and that nothing can be booked or paid until the connection returns.
 */
export default async function OfflinePage() {
  const t = await getTranslations('offline');
  const tenant = getTenantConfig();

  return (
    <div className="mx-auto flex max-w-container flex-col gap-8 px-6 py-12 md:px-8 lg:px-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-h1-compact text-default md:text-h1">{t('title')}</h1>
        <p className="max-w-prose text-body-lg text-secondary">{t('lede')}</p>
        <RetryButton label={t('retry')} />
      </header>

      <section aria-labelledby="saved-title" className="flex flex-col gap-3">
        <h2 id="saved-title" className="text-h4 text-default">
          {t('savedTitle')}
        </h2>
        <SavedTrips />
      </section>

      {tenant.emergencyContacts.length > 0 ? (
        <section
          aria-labelledby="offline-emergency-title"
          className="flex flex-col gap-3 rounded-lg bg-error-100 p-6 text-error-700"
        >
          <h2 id="offline-emergency-title" className="text-h4">
            {t('emergencyTitle')}
          </h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {tenant.emergencyContacts.map((contact) => (
              <div key={contact.label} className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">{contact.label}</dt>
                <dd>
                  <a
                    href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                    className="underline underline-offset-[3px]"
                  >
                    {contact.phone}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
