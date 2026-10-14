'use client';

import { cn } from '@ota/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { activePage, activeSection } from '@/lib/admin-nav';

/**
 * The pages a section holds (the screens that predate the redesign), as the
 * DS 03 tab row: 16/24 links, the current one in primary 700 over a 3 px
 * primary 600 rule. A section with a single page shows no row.
 */
export function SectionNav() {
  const pathname = usePathname();
  const t = useTranslations('backoffice');
  const section = activeSection(pathname);
  if (!section || section.pages.length < 2) {
    return null;
  }
  const current = activePage(section, pathname);

  return (
    <nav
      aria-label={t(`nav.${section.key}`)}
      className="flex gap-6 overflow-x-auto border-b bg-surface px-6"
    >
      {section.pages.map((page) => {
        const active = page === current;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px flex h-12 shrink-0 items-center whitespace-nowrap border-b-[3px] px-1 text-body font-medium transition-colors',
              active
                ? 'border-primary-600 font-semibold text-primary-700'
                : 'border-transparent text-secondary hover:text-default',
            )}
          >
            {t(`sections.${page.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
