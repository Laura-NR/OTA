import type { ComponentProps } from 'react';

import { Link } from '@/i18n/navigation';

type Href = ComponentProps<typeof Link>['href'];

/** The boards' breadcrumb: 14/20 links, "›" between them, the current page last. */
export function Breadcrumb({
  label,
  items,
}: {
  /** Names the landmark ("Breadcrumb"). */
  label: string;
  items: readonly { label: string; href?: Href }[];
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-2 text-body-sm">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="text-primary-600 underline underline-offset-[3px] hover:text-primary-700"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-secondary">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
