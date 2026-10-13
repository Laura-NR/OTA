'use client';

import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../cn';

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'role'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * DS 02 toggle: a 44 × 24 track with a 20 px knob, on in primary 600 and off in
 * neutral 300. It is a `role="switch"` button, so Space and Enter toggle it;
 * label it with visible text (`aria-labelledby`) or `aria-label`.
 */
export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-primary-600' : 'bg-neutral-300',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-neutral-0 shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
