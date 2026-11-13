import '@ota/ui/styles.css';

import './globals.css';

import { themeCssVariables } from '@ota/theming';
import { IconSprite } from '@ota/ui';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { CSSProperties, ReactNode } from 'react';

import { brand } from '@/lib/brand';
import { fontVariables } from '@/lib/font';
import { getTenantConfig } from '@/lib/tenant';

// The tenant manifest is read from disk and the session from cookies, so every
// route is rendered per request rather than prerendered at build time.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const tenant = getTenantConfig();
  const t = await getTranslations('backoffice.metadata');
  return {
    title: t('title', { agency: tenant.branding.agencyName }),
    description: t('description', { agency: tenant.branding.agencyName }),
    icons: { icon: brand.favicon.src },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = getTenantConfig();
  // Tenant tokens and font families live on <html>, where the alias tokens
  // resolve (see themeCssVariables).
  const tokens = themeCssVariables(tenant) as CSSProperties;
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} style={tokens} className={fontVariables}>
      <body className="min-h-screen antialiased">
        <IconSprite />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
