'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';

export interface AccordionItemProps {
  title: ReactNode;
  children: ReactNode;
  /** The heading level that wraps the trigger; keep the page's outline intact. */
  level?: 2 | 3 | 4;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * DS 03 accordion item: a heading wrapping a button (`aria-expanded`) that
 * controls its region; 56 px minimum, a neutral 200 rule below, a 20 px
 * chevron that turns when open.
 */
export function AccordionItem({
  title,
  children,
  level = 3,
  defaultOpen = false,
  className,
}: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const Heading = `h${level}` as const;
  return (
    <div className={cn('border-b', className)}>
      <Heading className="m-0">
        <button
          type="button"
          id={`${id}-trigger`}
          aria-expanded={open}
          aria-controls={`${id}-region`}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-14 w-full items-center justify-between gap-3 py-4 text-left text-body font-semibold text-default transition-colors hover:text-primary-700"
        >
          <span>{title}</span>
          <Icon
            name="chevron-down"
            className={cn('transition-transform', open ? 'rotate-180' : undefined)}
          />
        </button>
      </Heading>
      <div
        id={`${id}-region`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        hidden={!open}
        className="pb-4 text-body text-secondary"
      >
        {children}
      </div>
    </div>
  );
}
