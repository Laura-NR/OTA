import type { HTMLAttributes } from 'react';

import { cn } from '../cn';

/**
 * DS 03 pills: 13/16 label type, and a semantic `-100` surface with its `-700`
 * text. `warning` is the amber in-progress tone ("Confirming with hosts"),
 * `attention` adds the `warning-500` border for states that need someone to
 * act ("Action needed", the 75 % timer), `timeout` is the solid red
 * re-dispatch state and `accent` the ochre "Ready to pay". Status is never
 * colour alone: pair a badge with its label.
 */
export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'info'
  | 'success'
  | 'warning'
  | 'attention'
  | 'destructive'
  | 'timeout'
  | 'accent';

export type BadgeSize = 'sm' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-primary-100 text-primary-700',
  secondary: 'bg-neutral-100 text-neutral-700',
  outline: 'border-neutral-300 bg-surface text-neutral-700',
  info: 'bg-info-100 text-info-700',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  attention: 'border-warning-500 bg-warning-100 text-warning-700',
  destructive: 'bg-error-100 text-error-700',
  timeout: 'bg-timeout-600 text-neutral-0',
  accent: 'bg-accent-500 text-neutral-900',
};

const sizes: Record<BadgeSize, string> = {
  sm: 'h-6 px-2.5 text-label',
  lg: 'h-8 px-3 text-body-sm font-semibold',
};

export function Badge({
  className,
  variant = 'default',
  size = 'sm',
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent',
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
