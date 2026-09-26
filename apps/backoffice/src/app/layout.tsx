import '@ota/ui/styles.css';

import './globals.css';

import { themeCssVariables } from '@ota/theming';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { CSSProperties, ReactNode } from 'react';

import { bricolage } from '@/lib/font';
import { getTenantConfig } from '@/lib/tenant';

// The tenant manifest is read from disk and the session from cookies, so every
// route is rendered per request rather than prerendered at build time.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const tenant = getTenantConfig();
  return {
    title: `${tenant.branding.agencyName} — Back-office`,
    description: `Operations back-office for ${tenant.branding.agencyName}`,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = getTenantConfig();
  const tokens = themeCssVariables(tenant) as CSSProperties;
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        style={tokens}
        className={`${bricolage.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
