import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/** Tenant-flagged promotional strip (spec §4, `culturalEventsBanner`). */
export async function PromotionalBanner() {
  const t = await getTranslations('banner');

  return (
    <div className="border-b bg-primary-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-body-sm">
        <span>{t('text')}</span>
        <Link
          href="/destinations"
          className="font-medium text-primary-600 underline-offset-4 hover:underline"
        >
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
