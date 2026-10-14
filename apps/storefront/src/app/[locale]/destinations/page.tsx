import { conditionsContentSchema, destinationsContentSchema } from '@ota/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@/components/breadcrumb';
import { PageIntro } from '@/components/content/page-intro';
import { DestinationsExplorer } from '@/components/destinations/destinations-explorer';
import { getPageContent } from '@/lib/content';
import {
  buildDestinationViews,
  buildProvinceViews,
  getGeography,
  provinceCode,
} from '@/lib/geography';
import { getPackages } from '@/lib/packages';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('destinations') };
}

/**
 * Destinations (Destinations / M-Destinations boards), drawn from the tenant's
 * destination data and words, with each destination's trips and lowest price
 * from the live package catalogue. `?province=` (a code, or a name as the old
 * catalogue URLs carry) opens that province's panel.
 */
export default async function DestinationsPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string }>;
}) {
  const geography = getGeography();
  const [content, conditions, packages, nav, t, { province }] = await Promise.all([
    getPageContent('destinations', destinationsContentSchema),
    getPageContent('conditions', conditionsContentSchema),
    getPackages(),
    getTranslations('nav'),
    getTranslations('destinations'),
    searchParams,
  ]);
  if (!geography || !content) {
    notFound();
  }

  const provinces = buildProvinceViews(geography, content);
  const destinations = buildDestinationViews(geography, content, packages);
  const themes = Object.entries(content.themes)
    .filter(([key]) => destinations.some((destination) => destination.theme === key))
    .map(([key, label]) => ({ key, label }));
  const initial = province
    ? (provinces.find((item) => item.code === province)?.code ?? provinceCode(province))
    : null;
  const counts = t('eyebrow', {
    destinations: destinations.length,
    provinces: new Set(destinations.map((destination) => destination.province)).size,
  });

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-8 px-6 py-8 md:px-8 lg:px-10">
      <Breadcrumb
        label={t('breadcrumb')}
        items={[{ label: nav('home'), href: '/' }, { label: nav('destinations') }]}
      />
      <PageIntro
        status={
          content.status === 'published' && geography.status === 'published'
            ? 'published'
            : 'placeholder'
        }
        eyebrow={content.eyebrow ? `${counts} · ${content.eyebrow}` : counts}
        title={content.title}
        lede={content.lede}
        agencyName={getTenantConfig().branding.agencyName}
        large
      />
      <DestinationsExplorer
        provinces={provinces}
        destinations={destinations}
        themes={themes}
        updated={geography.updated}
        conditionsNote={
          conditions ? `${conditions.strip.headline} ${conditions.strip.text}` : null
        }
        initialProvince={
          initial && provinces.some((item) => item.code === initial) ? initial : null
        }
      />
    </div>
  );
}
