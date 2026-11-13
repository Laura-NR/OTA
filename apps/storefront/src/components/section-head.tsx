import { cn, Icon } from '@ota/ui';
import type { ComponentProps, ReactNode } from 'react';

import { Link } from '@/i18n/navigation';

type Href = ComponentProps<typeof Link>['href'];

/** A text link with the boards' trailing arrow ("All guides →"); the arrow is decoration. */
export function ArrowLink({
  href,
  children,
  className,
}: {
  href: Href;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'font-semibold text-primary-600 underline underline-offset-[3px] hover:text-primary-700',
        className,
      )}
    >
      {children}
      <Icon name="arrow-right" className="ml-1 inline-block h-4 w-4 align-[-3px]" />
    </Link>
  );
}

/**
 * The head of a page section: overline, display heading and, at the far end,
 * a link onward. The heading is 32/40 from `md` and the 28/34 compact size
 * below it (DS 07).
 */
export function SectionHead({
  id,
  eyebrow,
  title,
  eyebrowClassName,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  /** The overline is primary 600; Why and Custom draw it in terracotta or ochre. */
  eyebrowClassName?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1.5">
        {eyebrow ? (
          <p className={cn('text-overline uppercase text-primary-600', eyebrowClassName)}>
            {eyebrow}
          </p>
        ) : null}
        <h2 id={id} className="font-display text-h1-compact text-default md:text-h2">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
