import { siteNoindex } from '@ota/config';
import type { MetadataRoute } from 'next';

// Read per request, so one built image serves the trial (noindex) and launch.
export const dynamic = 'force-dynamic';

/**
 * `/robots.txt`: while `SITE_NOINDEX` is on, every crawler is asked to keep
 * out; the edge proxy adds `X-Robots-Tag: noindex` for pages reached anyway.
 */
export default function robots(): MetadataRoute.Robots {
  return siteNoindex()
    ? { rules: { userAgent: '*', disallow: '/' } }
    : { rules: { userAgent: '*', allow: '/' } };
}
