import type { HTMLAttributes } from 'react';

import { cn } from '../cn';

/**
 * DS 03 pills. The tones pair a semantic `-100` surface with its `-600` text;
 * the boards draw `-700` text, which is not a token yet (change request 01,
 * A2). `warning` is the amber in-progress tone ("Confirming with hosts"),
 * `attention` adds the amber border for states that need someone to act
 * ("Action needed", the 75 % timer), `timeout` is the solid red re-dispatch
 * state and `accent` the ochre "Ready to pay". Status is never colour alone:
 * pair a badge with its label.
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
  info: 'bg-info-100 text-info-600',
  success: 'bg-success-100 text-success-600',
  warning: 'bg-warning-100 text-warning-600',
  attention: 'border-warning-600 bg-warning-100 text-warning-600',
  destructive: 'bg-error-100 text-error-600',
  timeout: 'bg-timeout-600 text-neutral-0',
  accent: 'bg-accent-500 text-neutral-900',
};

const sizes: Record<BadgeSize, string> = {
  sm: 'h-6 px-2.5 text-caption font-semibold',
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
