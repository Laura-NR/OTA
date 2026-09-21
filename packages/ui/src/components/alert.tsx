import type { HTMLAttributes } from 'react';

import { cn } from '../cn';

export type AlertVariant = 'default' | 'destructive' | 'success';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const variants: Record<AlertVariant, string> = {
  default: 'bg-muted text-foreground',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  success: 'border-success/40 bg-success/10 text-success',
};

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn('rounded-md border px-4 py-3 text-sm', variants[variant], className)}
      {...props}
    />
  );
}
