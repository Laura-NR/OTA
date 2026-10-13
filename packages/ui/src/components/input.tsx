import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

import { cn } from '../cn';

/**
 * DS 02 text field: 40 px, 16 px text (no iOS zoom), teal border on focus and
 * the global 2 px focus ring; an invalid field (`aria-invalid`) turns its
 * border red. Label, helper and error text belong to the surrounding field.
 */
export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-surface px-3 text-body text-default transition-colors placeholder:text-muted focus:border-primary-600 aria-[invalid=true]:border-error-600 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
