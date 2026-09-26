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
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
