import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';
import type { IconName } from '../icons/sprite';

/** DS 03 loading placeholder in neutral 200; it never stands in for text a script must render. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-neutral-200', className)}
      {...props}
    />
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  /** The next useful action, never a dead end (A-States). */
  action?: ReactNode;
  className?: string;
}

/** A-States empty state: what is missing, why, and what to do next. */
export function EmptyState({
  icon = 'info',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-300 px-6 py-10 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-muted">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="text-h4 text-default">{title}</p>
      {description ? (
        <p className="max-w-prose text-body-sm text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
