'use client';

import { cn, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ADMIN_SECTIONS, activeSection } from '@/lib/admin-nav';

/**
 * The A-Dashboard section links: 44 px rows with a 20 px icon, primary 200 on
 * the dark sidebar, white when hovered or current. Sections without a page yet
 * are left out (see `ADMIN_SECTIONS`).
 */
export function MainNav() {
  const pathname = usePathname();
  const t = useTranslations('backoffice.nav');
  const current = activeSection(pathname);

  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-0.5 lg:flex-col">
      {ADMIN_SECTIONS.map((section) => {
        if (!section.href) {
          return null;
        }
        const active = section === current;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // On the dark sidebar the focus ring is ochre, drawn inside the item.
              'flex h-touch items-center gap-3 rounded-md px-3 text-body-sm font-medium transition-colors focus-visible:outline-accent-500 focus-visible:-outline-offset-2',
              active
                ? 'bg-neutral-0/[.14] font-semibold text-neutral-0'
                : 'text-primary-200 hover:bg-neutral-0/[.08] hover:text-neutral-0',
            )}
          >
            <Icon name={section.icon} />
            {t(section.key)}
          </Link>
        );
      })}
    </nav>
  );
}
