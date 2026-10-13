import type { HTMLAttributes } from 'react';

import { cn } from '../cn';

/**
 * DS 03 alert: a semantic `-100` surface with `-600` text. The boards draw a
 * `-200` border and `-700` text, neither of which is a token yet (change
 * request 01, A2), so the border is the `-600` tone at low opacity.
 */
export type AlertVariant = 'default' | 'info' | 'success' | 'warning' | 'destructive';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const variants: Record<AlertVariant, string> = {
  default: 'border-neutral-200 bg-sunken text-neutral-700',
  info: 'border-info-600/25 bg-info-100 text-info-600',
  success: 'border-success-600/25 bg-success-100 text-success-600',
  warning: 'border-warning-600/25 bg-warning-100 text-warning-600',
  destructive: 'border-error-600/25 bg-error-100 text-error-600',
};

/** Warnings and errors interrupt (`role="alert"`); the rest are polite status. */
const roles: Record<AlertVariant, 'alert' | 'status'> = {
  default: 'status',
  info: 'status',
  success: 'status',
  warning: 'alert',
  destructive: 'alert',
};

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role={roles[variant]}
      className={cn(
        'rounded-md border px-4 py-3.5 text-body-sm',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
