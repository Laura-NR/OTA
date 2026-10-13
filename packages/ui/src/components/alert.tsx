import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';
import type { IconName } from '../icons/sprite';

/**
 * DS 03 alert: a semantic `-100` surface with `-600` text, a 20 px icon and an
 * optional 16/24 title over 14/20 body. The boards draw a `-200` border and
 * `-700` text, neither of which is a token yet (change request 01, A2), so the
 * border is the `-600` tone at low opacity.
 */
export type AlertVariant = 'default' | 'info' | 'success' | 'warning' | 'destructive';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
}

const variants: Record<AlertVariant, string> = {
  default: 'border-neutral-200 bg-sunken text-neutral-700',
  info: 'border-info-600/25 bg-info-100 text-info-600',
  success: 'border-success-600/25 bg-success-100 text-success-600',
  warning: 'border-warning-600/25 bg-warning-100 text-warning-600',
  destructive: 'border-error-600/25 bg-error-100 text-error-600',
};

const icons: Record<AlertVariant, IconName> = {
  default: 'info',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  destructive: 'alert-circle',
};

/** Warnings and errors interrupt (`role="alert"`); the rest are polite status. */
const roles: Record<AlertVariant, 'alert' | 'status'> = {
  default: 'status',
  info: 'status',
  success: 'status',
  warning: 'alert',
  destructive: 'alert',
};

export function Alert({
  className,
  variant = 'default',
  title,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role={roles[variant]}
      className={cn(
        'flex items-start gap-3 rounded-md border px-4 py-3.5 text-body-sm',
        variants[variant],
        className,
      )}
      {...props}
    >
      <Icon name={icons[variant]} className="mt-px" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <p className="text-body font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
