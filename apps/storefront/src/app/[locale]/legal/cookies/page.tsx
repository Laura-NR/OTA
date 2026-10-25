import { CONSENT_COOKIE, parseCookieChoice } from '@ota/domain';
import { legalContentSchema } from '@ota/schemas';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';

import { PageIntro } from '@/components/content/page-intro';
import { CookieSettings } from '@/components/telemetry/cookie-settings';
import { DISMISSED_ADVISORIES_COOKIE } from '@/lib/advisory-cookie';
import { getPageContent } from '@/lib/content';
import { formatDay, plainSpaces } from '@/lib/format';
import { getTenantConfig } from '@/lib/tenant';
import { TELEMETRY_SESSION_KEY } from '@/lib/telemetry';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cookies');
  return { title: t('settingsTitle') };
}

/** What this storefront keeps on a device, by the name a browser shows. */
const STORED = [
  { key: 'session', name: 'better-auth.session_token', category: 'essential' },
  { key: 'locale', name: 'NEXT_LOCALE', category: 'essential' },
  { key: 'display', name: 'ota_display', category: 'essential' },
  { key: 'consent', name: CONSENT_COOKIE, category: 'essential' },
  { key: 'advisories', name: DISMISSED_ADVISORIES_COOKIE, category: 'essential' },
  { key: 'telemetry', name: TELEMETRY_SESSION_KEY, category: 'analytics' },
] as const;

/**
 * Legal › Cookie settings (Legal board): the visitor's current choice and
 * when it was saved, the switches to change it, and every cookie and storage
 * key the site sets. The analytics row is listed only when the agency offers
 * analytics; the words beside each switch are the tenant's consent texts.
 */
export default async function CookieSettingsPage() {
  const t = await getTranslations('cookies');
  const locale = await getLocale();
  const legal = await getPageContent('legal', legalContentSchema);
  const choice = parseCookieChoice((await cookies()).get(CONSENT_COOKIE)?.value);
  const offersAnalytics = Boolean(legal?.consents.COOKIES_ANALYTICS);
  const optional = offersAnalytics || Boolean(legal?.consents.COOKIES_MARKETING);
  const rows = STORED.filter((row) => row.category !== 'analytics' || offersAnalytics);

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-8 px-6 py-12 md:px-8">
      <PageIntro
        status={legal?.status ?? 'placeholder'}
        title={t('settingsTitle')}
        lede={t('settingsLede')}
        agencyName={getTenantConfig().branding.agencyName}
      />
      {optional ? (
        <section className="flex flex-col gap-3">
          <p className="text-body text-secondary">
            {choice
              ? t('current', {
                  date: plainSpaces(formatDay(choice.savedAt.toISOString(), locale)),
                })
              : t('currentNone')}
          </p>
          <CookieSettings />
        </section>
      ) : (
        <p className="text-body text-secondary">{t('noOptional')}</p>
      )}
      <section aria-labelledby="cookies-stored" className="flex min-w-0 flex-col gap-3">
        <h2 id="cookies-stored" className="text-h3 text-default">
          {t('tableTitle')}
        </h2>
        <Table scrollRegionLabel={t('tableTitle')}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.name')}</TableHead>
              <TableHead>{t('columns.category')}</TableHead>
              <TableHead>{t('columns.purpose')}</TableHead>
              <TableHead>{t('columns.lifetime')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-mono text-body-sm">{row.name}</TableCell>
                <TableCell>{t(row.category)}</TableCell>
                <TableCell>{t(`items.${row.key}.purpose`)}</TableCell>
                <TableCell>{t(`items.${row.key}.lifetime`)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
