import '@ota/ui/styles.css';

import './globals.css';

import { themeCssVariables } from '@ota/theming';
import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

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

export default function RootLayout({ children }: { children: ReactNode }) {
  const tenant = getTenantConfig();
  const tokens = themeCssVariables(tenant) as CSSProperties;

  return (
    <html lang={tenant.primaryLocale}>
      <body
        style={tokens}
        className="min-h-screen bg-background text-foreground antialiased"
      >
        {children}
      </body>
    </html>
  );
}
