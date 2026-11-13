'use client';

import type { ReactNode } from 'react';

import { cn } from '../cn';
import { buttonClassName } from './button';
import { Icon } from './icon';

/** Keep a counter value inside its bounds. */
export function clampCount(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface CounterProps {
  /** Names the counter, e.g. "Adults"; shown as the row label. */
  label: ReactNode;
  /** A muted second line, e.g. "18 and over". */
  description?: ReactNode;
  value: number;
  min?: number;
  max?: number;
  onValueChange: (value: number) => void;
  /** Accessible names of the two buttons, e.g. "Remove one adult" / "Add one adult". */
  decrementLabel: string;
  incrementLabel: string;
  className?: string;
}

/**
 * DS 02 counter: − / + secondary buttons of 44 px around a mono value that is
 * announced politely. A bound disables its button rather than ignoring clicks.
 */
export function Counter({
  label,
  description,
  value,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  onValueChange,
  decrementLabel,
  incrementLabel,
  className,
}: CounterProps) {
  const button = buttonClassName({ variant: 'secondary', size: 'icon' });
  return (
    <div className={cn('flex min-h-touch items-center justify-between gap-4', className)}>
      <div className="flex flex-col">
        <span className="text-body text-default">{label}</span>
        {description ? (
          <span className="text-body-sm text-muted">{description}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={button}
          aria-label={decrementLabel}
          disabled={value <= min}
          onClick={() => onValueChange(clampCount(value - 1, min, max))}
        >
          <Icon name="minus" />
        </button>
        <span
          aria-live="polite"
          className="w-6 text-center font-mono text-body text-default"
        >
          {value}
        </span>
        <button
          type="button"
          className={button}
          aria-label={incrementLabel}
          disabled={value >= max}
          onClick={() => onValueChange(clampCount(value + 1, min, max))}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
