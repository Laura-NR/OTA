import { DEFAULT_LOCALE } from '@ota/i18n';
import { destinationsContentSchema, type ProposalDto } from '@ota/schemas';
import { buttonClassName } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import {
  CustomBuilder,
  type BuilderActivity,
  type BuilderProvince,
} from '@/components/custom-builder';
import { FeatureOff } from '@/components/feature-off';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';
import { getCatalog } from '@/lib/catalog';
import { getPageContent } from '@/lib/content';
import { countryOptions } from '@/lib/countries';
import { getFeatures } from '@/lib/features';
import { getGeography, provinceCode, provinceName } from '@/lib/geography';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('build');
  return { title: t('title') };
}

/**
 * The designed custom builder (Custom / M-Custom boards), behind sign-in like
 * the Booking form. Provinces come from the tenant's destination data (only
 * those it serves), activities from the live catalogue's experiences, and the
 * styles and sample rates from the manifest's `customBuilder` block. Closed,
 * before sign-in, while the builder is switched off (M9 D8b). With
 * `?edit=<proposal id>` it reopens the traveler's own request ("Keep building
 * the trip") until the desk has sent the priced proposal.
 */
export default async function CustomPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  if (!(await getFeatures()).customItineraryBuilder) {
    return <FeatureOff feature="customItineraryBuilder" />;
  }
  const { edit } = await searchParams;
  const locale = await getLocale();
  const session = await getServerSession();
  if (!session) {
    const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
    const back = `${prefix}/custom${edit ? `?edit=${encodeURIComponent(edit)}` : ''}`;
    redirect(`${prefix}/login?next=${encodeURIComponent(back)}`);
  }

  const editing = edit
    ? await apiFetch<ProposalDto>(`/me/proposals/${encodeURIComponent(edit)}`).catch(
        () => null,
      )
    : null;
  if (edit && !editing) {
    notFound();
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

  if (editing && !editing.editable) {
    return (
      <div className="mx-auto flex w-full max-w-container flex-col gap-6 px-6 py-8 md:px-8 md:py-10 lg:px-10">
        <section
          aria-labelledby="locked-title"
          className="flex flex-col items-start gap-4 rounded-lg border bg-surface p-6 md:p-8"
        >
          <h1 id="locked-title" className="text-h3 text-default">
            {t('edit.lockedTitle')}
          </h1>
          <p className="max-w-[70ch] text-body text-secondary">
            {t('edit.locked', { reference: editing.reference })}
          </p>
          <Link
            href={`/account/proposals/${editing.id}`}
            className={buttonClassName({ size: 'lg' })}
          >
            {t('openProposal')}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-6 px-6 py-8 md:px-8 md:py-10 lg:px-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1-compact text-default md:text-h1">
          {editing ? t('edit.title') : t('title')}
        </h1>
        <p className="max-w-[70ch] text-body text-secondary">
          {editing
            ? t('edit.description', { reference: editing.reference })
            : t('description')}
        </p>
      </div>
      <CustomBuilder
        editing={
          editing
            ? {
                proposalId: editing.id,
                reference: editing.reference,
                payload: editing.request.payload,
                notes: editing.request.notes,
                locale: editing.request.locale,
              }
            : null
        }
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
