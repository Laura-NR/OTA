import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { NotFoundContent } from '@/components/not-found-content';
import { SiteDocument } from '@/components/site-document';
import { siteMetadata } from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'errors.notFound' });
  return { ...(await siteMetadata(locale)), title: t('metaTitle') };
}

/**
 * An unmatched path (`/en/old-link`, `/old-link`, an unknown locale). No route
 * matches, so Next renders this with status 404 entirely on the server, in the
 * locale the middleware resolved and the whole site layout.
 */
export default async function RootNotFound() {
  const locale = await getLocale();
  return (
    <SiteDocument locale={locale}>
      <NotFoundContent />
    </SiteDocument>
  );
}
