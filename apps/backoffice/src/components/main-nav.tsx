'use client';

import { cn } from '@ota/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', key: 'reservations' },
  { href: '/escalation', key: 'escalation' },
  { href: '/messages', key: 'messages' },
  { href: '/suppliers', key: 'suppliers' },
  { href: '/applications', key: 'applications' },
  { href: '/dispatch', key: 'dispatch' },
  { href: '/inventory', key: 'inventory' },
  { href: '/packages', key: 'packages' },
  { href: '/imports', key: 'imports' },
  { href: '/documents', key: 'documents' },
  { href: '/analytics', key: 'analytics' },
  { href: '/regulatory', key: 'regulatory' },
  { href: '/quality', key: 'quality' },
  { href: '/retention', key: 'retention' },
] as const;

export function MainNav() {
  const pathname = usePathname();
  const t = useTranslations('backoffice.nav');

  return (
    <nav className="flex flex-col gap-1 px-3">
      {ITEMS.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // On the dark sidebar the focus ring is ochre, drawn inside the item.
              'flex h-touch items-center rounded-md px-3 text-body-sm font-medium transition-colors focus-visible:outline-accent-500 focus-visible:-outline-offset-2',
              active
                ? 'bg-neutral-0/[.14] font-semibold text-neutral-0'
                : 'text-primary-100 hover:bg-neutral-0/[.08] hover:text-neutral-0',
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
