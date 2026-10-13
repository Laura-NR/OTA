import { forwardRef } from 'react';
import type { LabelHTMLAttributes } from 'react';

import { cn } from '../cn';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-body-sm font-medium text-default peer-disabled:cursor-not-allowed peer-disabled:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
