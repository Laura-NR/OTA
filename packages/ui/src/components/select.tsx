import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';

import { cn } from '../cn';

/** DS 02 native select, styled as the text field. */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-surface px-3 text-body text-default transition-colors placeholder:text-muted focus:border-primary-600 aria-[invalid=true]:border-error-600 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
