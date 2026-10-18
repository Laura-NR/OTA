import { DEFAULT_LOCALE } from '@ota/i18n';
import { destinationsContentSchema } from '@ota/schemas';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import {
  CustomBuilder,
  type BuilderActivity,
  type BuilderProvince,
} from '@/components/custom-builder';
import { getServerSession } from '@/lib/api';
import { getCatalog } from '@/lib/catalog';
import { getPageContent } from '@/lib/content';
import { countryOptions } from '@/lib/countries';
import { getGeography, provinceCode, provinceName } from '@/lib/geography';
import { getTenantConfig } from '@/lib/tenant';

/**
 * The designed custom builder (Custom / M-Custom boards), behind sign-in like
 * the Booking form. Provinces come from the tenant's destination data (only
 * those it serves), activities from the live catalogue's experiences, and the
 * styles and sample rates from the manifest's `customBuilder` block.
 */
export default async function CustomPage() {
  const locale = await getLocale();
  const session = await getServerSession();
  if (!session) {
    const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
    redirect(`${prefix}/login?next=${encodeURIComponent(`${prefix}/custom`)}`);
  }

  const [t, experiences, content] = await Promise.all([
    getTranslations('build'),
    getCatalog({ type: 'EXPERIENCE' }),
    getPageContent('destinations', destinationsContentSchema),
  ]);
  const tenant = getTenantConfig();
  const geography = getGeography();

  const provinces: BuilderProvince[] = (geography?.provinces ?? [])
    .filter((province) => province.network !== 'none')
    .sort((a, b) => a.kmFromHavana - b.kmFromHavana)
    .map((province) => ({
      code: province.code,
      name: provinceName(province.code),
      summary: content?.provinces[province.code]?.summary ?? null,
      limited: province.network === 'limited',
      kmFromHavana: province.kmFromHavana,
      nights: province.nights,
    }));
  const served = new Set(provinces.map((province) => province.code));
  const activities: BuilderActivity[] = experiences.flatMap((item) => {
    const code = item.province ? provinceCode(item.province) : null;
    return code && served.has(code)
      ? [
          {
            id: item.id,
            name: item.name,
            province: code,
            price: Number(item.basePrice),
            currency: item.currency,
          },
        ]
      : [];
  });
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
  const locales = tenant.supportedLocales.map((code) => ({
    code,
    name: languageNames.of(code) ?? code,
  }));

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-6 px-6 py-8 md:px-8 md:py-10 lg:px-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1-compact text-default md:text-h1">{t('title')}</h1>
        <p className="max-w-[70ch] text-body text-secondary">{t('description')}</p>
      </div>
      <CustomBuilder
        provinces={provinces}
        activities={activities}
        builder={tenant.customBuilder}
        countries={countryOptions(locale)}
        locales={locales}
        todayIso={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
