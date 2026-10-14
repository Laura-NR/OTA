import '@ota/ui/styles.css';

import '../globals.css';

import { isFeatureEnabled } from '@ota/config';
import { isSupportedLocale } from '@ota/i18n';
import { themeCssVariables } from '@ota/theming';
import { IconSprite } from '@ota/ui';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { PromotionalBanner } from '@/components/promotional-banner';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getServerSession } from '@/lib/api';
import { brand } from '@/lib/brand';
import { fontVariables } from '@/lib/font';
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
  // Tenant tokens and font families live on <html>, where the alias tokens
  // resolve (see themeCssVariables).
  const tokens = themeCssVariables(tenant) as CSSProperties;
  const messages = await getMessages();
  const signedIn = Boolean(await getServerSession());

  return (
    <html lang={locale} style={tokens} className={fontVariables}>
      {/* Below md the bottom nav is fixed; the body pads for it. */}
      <body className="flex min-h-screen flex-col pb-16 antialiased md:pb-0">
        <IconSprite />
        <NextIntlClientProvider messages={messages}>
          <SiteHeader agencyName={tenant.branding.agencyName} signedIn={signedIn} />
          {isFeatureEnabled(tenant, 'culturalEventsBanner') ? (
            <PromotionalBanner />
          ) : null}
          <main className="flex-1">{children}</main>
          <SiteFooter tenant={tenant} />
          <BottomNav signedIn={signedIn} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
