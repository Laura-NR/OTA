import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';

/** DS 02 native select, styled as the text field, with a 20 px chevron 12 px from the right. */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <div className={cn('relative w-full', className)}>
      <select
        ref={ref}
        className="flex h-10 w-full appearance-none rounded-md border border-input bg-surface pl-3 pr-10 text-body text-default transition-colors focus:border-primary-600 aria-[invalid=true]:border-error-600 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
        {...props}
      />
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  ),
);
Select.displayName = 'Select';
