import { contentPageSchema } from '@ota/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ContentPageView } from '@/components/content/content-page';
import { getPageContent } from '@/lib/content';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('travelInfo') };
}

/**
 * Travel info (PreTrip board): entry, money, health, packing, connectivity,
 * etiquette and US travelers. The board's live "Current conditions" waits for
 * A-Content: operational data is never static copy.
 */
export default async function TravelInfoPage() {
  const content = await getPageContent('travelInfo', contentPageSchema);
  if (!content) {
    notFound();
  }
  return (
    <ContentPageView
      content={content}
      agencyName={getTenantConfig().branding.agencyName}
    />
  );
}
