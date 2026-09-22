'use client';

import { cn } from '@ota/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Reservations' },
  { href: '/escalation', label: 'Escalation' },
  { href: '/messages', label: 'Messages' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/applications', label: 'Applications' },
  { href: '/dispatch', label: 'Dispatch' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/imports', label: 'Imports' },
  { href: '/documents', label: 'Documents' },
  { href: '/analytics', label: 'Analytics' },
] as const;

export function MainNav() {
  const pathname = usePathname();

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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
