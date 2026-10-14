import type { IconName } from '@ota/ui';

/**
 * The storefront's navigation (Home header, DS 07). A link whose page does not
 * exist yet has no `href` and is not rendered, so the site never links to a
 * missing page; Events appears with Concierge (M10). Paths are locale-free:
 * the i18n `Link` adds the prefix.
 */
export interface SiteLink {
  key: string;
  href: string | null;
}

export interface BottomNavLink extends SiteLink {
  icon: IconName;
}

/** Destinations · Packages · Events · Travel info · Blog & guides · Support. */
export const PRIMARY_NAV: readonly SiteLink[] = [
  { key: 'destinations', href: '/destinations' },
  { key: 'packages', href: '/packages' },
  { key: 'events', href: null },
  { key: 'travelInfo', href: '/travel-info' },
  { key: 'blog', href: '/blog' },
  { key: 'support', href: '/support' },
];

/** Below `md`: Home · Search · Trips · Support, then the menu button. */
export const BOTTOM_NAV: readonly BottomNavLink[] = [
  { key: 'home', href: '/', icon: 'home' },
  { key: 'search', href: '/packages', icon: 'search' },
  { key: 'trips', href: '/account', icon: 'briefcase' },
  { key: 'support', href: '/support', icon: 'message-circle' },
];

/** Whether `pathname` (locale-free) is `href` or one of its pages. */
export function isCurrent(pathname: string, href: string): boolean {
  return href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);
}
