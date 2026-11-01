import '@ota/ui/styles.css';

import '../globals.css';

import { CONSENT_COOKIE, DISPLAY_COOKIE, parseDisplayPreferences } from '@ota/domain';
import { SUPPORTED_LOCALES, isSupportedLocale } from '@ota/i18n';
import { legalContentSchema } from '@ota/schemas';
import { themeCssVariables } from '@ota/theming';
import { IconSprite } from '@ota/ui';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { CurrencyProvider } from '@/components/currency/currency-provider';
import { BandwidthStrip } from '@/components/display/bandwidth-strip';
import { DisplayProvider } from '@/components/display/display-provider';
import { OfflinePill } from '@/components/offline/offline-pill';
import { ServiceWorkerRegistration } from '@/components/offline/service-worker';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SiteStrips } from '@/components/site-strips';
import { TelemetryProvider } from '@/components/telemetry/telemetry-provider';
import { getServerSession } from '@/lib/api';
import { brand } from '@/lib/brand';
import { getPageContent } from '@/lib/content';
import { getDisplayCurrency } from '@/lib/currency';
import { displayAttributes } from '@/lib/display';
import { fontVariables } from '@/lib/font';
import { getFeatures } from '@/lib/features';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tenant = getTenantConfig();
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return {
    title: t('title', { agency: tenant.branding.agencyName }),
    description: t('description', { agency: tenant.branding.agencyName }),
    icons: { icon: brand.favicon.src },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const tenant = getTenantConfig();
  const features = await getFeatures();
  // Tenant tokens and font families live on <html>, where the alias tokens
  // resolve (see themeCssVariables).
  const tokens = themeCssVariables(tenant) as CSSProperties;
  const messages = await getMessages();
  const nav = await getTranslations({ locale, namespace: 'nav' });
  const signedIn = Boolean(await getServerSession());
  const money = await getDisplayCurrency();
  // Larger text and low-bandwidth mode are the device's (a cookie), so the
  // page renders in them from its first byte.
  const store = await cookies();
  const display = parseDisplayPreferences(store.get(DISPLAY_COOKIE)?.value);
  // The cookie choice (DS 04) is read here too, so the banner is in the
  // first byte for a visitor who has not chosen, and never flashes otherwise.
  const legal = await getPageContent('legal', legalContentSchema);
  const cookieTexts = {
    analytics: legal?.consents.COOKIES_ANALYTICS ?? null,
    marketing: legal?.consents.COOKIES_MARKETING ?? null,
  };

  return (
    <html
      lang={locale}
      style={tokens}
      className={fontVariables}
      {...displayAttributes(display)}
    >
      {/* Below md the bottom nav is fixed; the body pads for it. */}
      <body className="flex min-h-screen flex-col pb-16 antialiased md:pb-0">
        {/* The first stop: past the strips and the header to the page (WCAG 2.4.1). */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-body-sm focus:font-semibold focus:text-primary-700 focus:shadow-md"
        >
          {nav('skip')}
        </a>
        <IconSprite />
        <NextIntlClientProvider messages={messages}>
          <DisplayProvider initial={display}>
            <CurrencyProvider initial={money}>
              <TelemetryProvider
                initialCookie={store.get(CONSENT_COOKIE)?.value ?? null}
                texts={cookieTexts}
                signedIn={signedIn}
                currency={money.code}
                locales={SUPPORTED_LOCALES}
              >
                <BandwidthStrip />
                <SiteStrips events={features.culturalEventsBanner} signedIn={signedIn} />
                <SiteHeader agencyName={tenant.branding.agencyName} signedIn={signedIn} />
                <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
                  {children}
                </main>
                <SiteFooter tenant={tenant} />
                <BottomNav signedIn={signedIn} />
                <OfflinePill />
                <ServiceWorkerRegistration />
              </TelemetryProvider>
            </CurrencyProvider>
          </DisplayProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
