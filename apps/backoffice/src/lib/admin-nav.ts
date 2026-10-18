import type { IconName } from '@ota/ui';

/**
 * The A-Dashboard sidebar: the desk's ten sections, in the design's order.
 * A section whose module is not built yet has no `href` and is not shown, so
 * the sidebar never links to a missing page; it appears once its pages land.
 * Disruptions holds the M8 cases and Content the M7 advisories. Payments and
 * Settings are read-only until M4 and M9.
 * `pages` are the screens that predate the redesign, re-homed under their
 * section and shown as its sub-navigation; the old paths redirect
 * (`next.config.ts`).
 */
export interface AdminPage {
  key: string;
  href: string;
}

export interface AdminSection {
  key: string;
  icon: IconName;
  /** Where the sidebar link goes; null while the section has no page. */
  href: string | null;
  /** The path prefix that marks the section active. */
  base: string;
  pages: readonly AdminPage[];
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    key: 'dashboard',
    icon: 'layout-dashboard',
    href: '/dashboard',
    base: '/dashboard',
    pages: [],
  },
  {
    key: 'bookings',
    icon: 'file-text',
    href: '/bookings',
    base: '/bookings',
    pages: [
      { key: 'board', href: '/bookings' },
      { key: 'proposals', href: '/bookings/proposals' },
      { key: 'messages', href: '/bookings/messages' },
      { key: 'documents', href: '/bookings/documents' },
    ],
  },
  {
    key: 'disruptions',
    icon: 'alert-triangle',
    href: '/disruptions',
    base: '/disruptions',
    pages: [],
  },
  {
    key: 'packages',
    icon: 'package',
    href: '/packages',
    base: '/packages',
    pages: [
      { key: 'packages', href: '/packages' },
      { key: 'inventory', href: '/packages/inventory' },
      { key: 'imports', href: '/packages/imports' },
    ],
  },
  {
    key: 'customers',
    icon: 'users',
    href: '/customers',
    base: '/customers',
    pages: [
      { key: 'customers', href: '/customers' },
      { key: 'retention', href: '/customers/retention' },
    ],
  },
  {
    key: 'suppliers',
    icon: 'building',
    href: '/suppliers',
    base: '/suppliers',
    pages: [
      { key: 'suppliers', href: '/suppliers' },
      { key: 'applications', href: '/suppliers/applications' },
    ],
  },
  {
    key: 'payments',
    icon: 'credit-card',
    href: '/payments',
    base: '/payments',
    pages: [],
  },
  {
    key: 'content',
    icon: 'pencil',
    href: '/content/advisories',
    base: '/content',
    pages: [],
  },
  {
    key: 'reports',
    icon: 'bar-chart',
    href: '/reports',
    base: '/reports',
    pages: [],
  },
  { key: 'settings', icon: 'settings', href: '/settings', base: '/settings', pages: [] },
];

const within = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The section a path belongs to, if any. */
export function activeSection(pathname: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find((section) => within(pathname, section.base));
}

/**
 * The sub-page a path belongs to: the longest page path that contains it, so
 * a booking's detail page (`/bookings/<id>`) keeps the Pipeline tab active.
 */
export function activePage(
  section: AdminSection,
  pathname: string,
): AdminPage | undefined {
  return [...section.pages]
    .filter((page) => within(pathname, page.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
