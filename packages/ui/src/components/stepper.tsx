import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';

export type StepState = 'done' | 'current' | 'upcoming' | 'error';

export interface StepperStep {
  id: string;
  label: ReactNode;
  state: StepState;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  /**
   * The compact line shown below `md` instead of the row, e.g.
   * "Step 2 of 5 · Transport", already localised by the caller.
   */
  progressLabel: string;
  className?: string;
}

const dots: Record<StepState, string> = {
  done: 'border-primary-600 bg-primary-600 text-on-primary',
  current: 'border-accent-500 bg-accent-500 text-neutral-900 ring-4 ring-accent-100',
  upcoming: 'border-input bg-surface text-muted',
  error: 'border-error-600 bg-error-100 text-error-600',
};

/**
 * DS 03 stepper: 32 px dots joined by a 2 px line, done in primary 600, current
 * in ochre with a halo, upcoming outlined. Below `md` it becomes the progress
 * label over an 8 px bar. The list is an `ol` with `aria-current="step"`.
 */
export function Stepper({ steps, progressLabel, className }: StepperProps) {
  // The bar fills to the furthest step reached, so a finished journey or a
  // step held in error still shows how far it got.
  const reached = steps.reduce(
    (furthest, step, index) => (step.state === 'upcoming' ? furthest : index),
    -1,
  );
  const progress = steps.length ? ((reached + 1) / steps.length) * 100 : 0;

  return (
    <div className={className}>
      <div className="md:hidden">
        <p className="text-body-sm font-medium text-default">{progressLabel}</p>
        <div
          aria-hidden="true"
          className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className="h-full rounded-full bg-primary-600"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ol className="hidden items-start md:flex">
        {steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex flex-1 flex-col items-center gap-2 last:flex-none"
          >
            <div className="flex w-full items-center">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-body-sm font-semibold',
                  dots[step.state],
                )}
              >
                {step.state === 'done' ? (
                  <Icon name="check" className="h-4 w-4" />
                ) : step.state === 'error' ? (
                  <Icon name="alert-circle" className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mx-2 h-0.5 flex-1',
                    step.state === 'done' ? 'bg-primary-600' : 'bg-neutral-300',
                  )}
                />
              ) : null}
            </div>
            <span
              className={cn(
                'self-start text-caption',
                step.state === 'current' ? 'font-semibold text-default' : 'text-muted',
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
