import type { ReactNode } from 'react';

/**
 * A pass-through: the locale layout and the root `not-found.tsx` each render
 * the `<html>` (SiteDocument). It exists so an unmatched path gets Next's
 * not-found route, whose 404 the server renders in full.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
