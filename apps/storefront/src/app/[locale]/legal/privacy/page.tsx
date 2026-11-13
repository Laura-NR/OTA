import { contentPageSchema } from '@ota/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ContentPageView } from '@/components/content/content-page';
import { getPageContent } from '@/lib/content';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('footer');
  return { title: t('privacy') };
}

/**
 * The privacy notice (Legal board, privacy section). Cookie settings is its
 * own page (`/legal/cookies`); the other legal texts (terms, cancellation,
 * data rights, sanctions) wait for counsel and the legal entity, so the Legal
 * hub is not built yet.
 */
export default async function PrivacyPage() {
  const content = await getPageContent('privacy', contentPageSchema);
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
