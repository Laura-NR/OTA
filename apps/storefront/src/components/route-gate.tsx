'use client';

import type { ReactNode } from 'react';

import { usePathname } from '@/i18n/navigation';
import { isPlanningPath } from '@/lib/site-nav';

/**
 * Renders a strip above the header only on the pages that draw it. The layout
 * renders the strips (they sit above the sticky header), and only the client
 * knows the route; the check also runs during server rendering, so nothing
 * flashes.
 */
export function RouteGate({
  only,
  children,
}: {
  only: 'home' | 'planning';
  children: ReactNode;
}) {
  const pathname = usePathname();
  const shown = only === 'home' ? pathname === '/' : isPlanningPath(pathname);
  return shown ? children : null;
}
