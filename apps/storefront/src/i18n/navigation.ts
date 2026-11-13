import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/** Locale-aware navigation helpers (keep the active locale prefix in links). */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
