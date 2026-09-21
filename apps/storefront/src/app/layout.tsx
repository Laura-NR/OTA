import '@ota/ui/styles.css';

import './globals.css';

import { themeCssVariables } from '@ota/theming';
import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getTenantConfig } from '@/lib/tenant';

export function generateMetadata(): Metadata {
  const tenant = getTenantConfig();
  return {
    title: `${tenant.branding.agencyName} — Authentic Cuban travel`,
    description: `Community-based ecotourism, agrotourism, and cultural travel across Cuba with ${tenant.branding.agencyName}.`,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const tenant = getTenantConfig();
  const tokens = themeCssVariables(tenant) as CSSProperties;

  return (
    <html lang={tenant.primaryLocale}>
      <body
        style={tokens}
        className="flex min-h-screen flex-col bg-background text-foreground antialiased"
      >
        <SiteHeader agencyName={tenant.branding.agencyName} />
        <main className="flex-1">{children}</main>
        <SiteFooter tenant={tenant} />
      </body>
    </html>
  );
}
