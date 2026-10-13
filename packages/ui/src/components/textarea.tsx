import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

import { cn } from '../cn';

/** DS 02 textarea: the text field's border, focus and error states, free height. */
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-24 w-full rounded-md border border-input bg-surface px-3 py-2 text-body text-default transition-colors placeholder:text-muted focus:border-primary-600 aria-[invalid=true]:border-error-600 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
