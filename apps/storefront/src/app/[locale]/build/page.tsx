import { DEFAULT_LOCALE } from '@ota/i18n';
import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { PackageBuilder } from '@/components/package-builder';
import { getServerSession } from '@/lib/api';
import { getCatalog } from '@/lib/catalog';

export default async function BuildPage() {
  const session = await getServerSession();
  if (!session) {
    const locale = await getLocale();
    const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
    redirect(`${prefix}/login?next=${encodeURIComponent(`${prefix}/build`)}`);
  }

  const t = await getTranslations('build');
  const items = await getCatalog();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('description')}</p>
      <div className="mt-6">
        <PackageBuilder items={items} />
      </div>
    </div>
  );
}
