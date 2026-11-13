import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';

export interface FilterChipProps {
  children: ReactNode;
  /** Removes the filter; the button's accessible name is `removeLabel`, e.g. "Remove filter Eco". */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

/**
 * DS 02 applied-filter chip: 32 px, primary 100 with primary 700 text and a
 * 20 px remove button that hovers to primary 200.
 */
export function FilterChip({
  children,
  onRemove,
  removeLabel,
  className,
}: FilterChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-100 pl-3 pr-2.5 text-body-sm font-medium text-primary-700',
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary-200"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

/** DS 03 tag: a quiet 24 px label for categories and collections. */
export function Tag({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-sm bg-neutral-100 px-2 text-caption text-neutral-700',
        className,
      )}
      {...props}
    />
  );
}
