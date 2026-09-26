import '@ota/ui/styles.css';

import '../globals.css';

import { isFeatureEnabled } from '@ota/config';
import { isSupportedLocale } from '@ota/i18n';
import { themeCssVariables } from '@ota/theming';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

import { PromotionalBanner } from '@/components/promotional-banner';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { bricolage } from '@/lib/font';
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
  const tokens = themeCssVariables(tenant) as CSSProperties;
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        style={tokens}
        className={`${bricolage.variable} flex min-h-screen flex-col bg-background font-sans text-foreground antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <SiteHeader agencyName={tenant.branding.agencyName} />
          {isFeatureEnabled(tenant, 'culturalEventsBanner') ? (
            <PromotionalBanner />
          ) : null}
          <main className="flex-1">{children}</main>
          <SiteFooter tenant={tenant} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
