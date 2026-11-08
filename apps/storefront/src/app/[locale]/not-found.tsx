import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { NotFoundContent } from '@/components/not-found-content';

/** The title in the server's HTML; the `<title>` in the content keeps it once hydrated. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('errors.notFound');
  return { title: t('metaTitle') };
}

/**
 * A page's own `notFound()` (a missing slug, a page switched off). Next 15
 * cannot catch it while rendering on the server, so its HTML is Next's bare
 * error document and this renders once the client has hydrated. An unmatched
 * path is the root `not-found.tsx`, rendered in full on the server.
 */
export default function NotFound() {
  return <NotFoundContent />;
}
