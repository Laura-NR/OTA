'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';
import type { IconName } from '../icons/sprite';

export type CrisisSeverity = 'info' | 'warning' | 'critical';

export interface CrisisBannerProps {
  severity: CrisisSeverity;
  /** Names the region for assistive technology, e.g. "Travel advisory". */
  label: string;
  title: ReactNode;
  children?: ReactNode;
  /** A link or button to the details. */
  action?: ReactNode;
  /**
   * A critical banner has no close control: it must be acknowledged. This is
   * the acknowledge button's text; once pressed the banner collapses to a dot.
   */
  acknowledgeLabel?: string;
  /** The accessible name of the collapsed dot, which reopens the banner. */
  reopenLabel?: string;
  className?: string;
}

const tones: Record<CrisisSeverity, string> = {
  info: 'bg-info-100 text-info-600',
  warning: 'bg-warning-100 text-warning-600',
  critical: 'bg-error-600 text-neutral-0',
};

const icons: Record<CrisisSeverity, IconName> = {
  info: 'info',
  warning: 'alert-triangle',
  critical: 'alert-circle',
};

/**
 * DS 03 crisis banner, sticky at the top: info and warning are tinted, critical
 * is solid red with white text and must be acknowledged (no ✕). Two lines at
 * most on a phone.
 */
export function CrisisBanner({
  severity,
  label,
  title,
  children,
  action,
  acknowledgeLabel,
  reopenLabel,
  className,
}: CrisisBannerProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (severity === 'critical' && acknowledged) {
    return (
      <div
        role="region"
        aria-label={label}
        className={cn('sticky top-0 z-40 flex justify-end px-4 py-1', className)}
      >
        <button
          type="button"
          aria-label={reopenLabel ?? label}
          onClick={() => setAcknowledged(false)}
          className="h-touch w-touch rounded-full"
        >
          <span
            aria-hidden="true"
            className="mx-auto block h-2.5 w-2.5 rounded-full bg-error-600"
          />
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={label}
      className={cn(
        'sticky top-0 z-40 px-4 py-2.5 sm:px-6 sm:py-3.5',
        tones[severity],
        className,
      )}
    >
      <div className="mx-auto flex max-w-container flex-wrap items-center gap-x-4 gap-y-2">
        <Icon name={icons[severity]} />
        <p className="line-clamp-2 min-w-0 flex-1 text-body-sm md:line-clamp-none">
          <strong className="font-semibold">{title}</strong>
          {children ? <> {children}</> : null}
        </p>
        {action}
        {severity === 'critical' && acknowledgeLabel ? (
          <button
            type="button"
            onClick={() => setAcknowledged(true)}
            className="h-8 rounded-md border border-neutral-0 px-3 text-body-sm font-semibold focus-visible:outline-accent-500"
          >
            {acknowledgeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
