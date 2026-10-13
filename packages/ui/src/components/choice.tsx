import { forwardRef } from 'react';
import type { FieldsetHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '../cn';

export interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The visible label; the native input sits inside it, so the whole row is clickable. */
  label: ReactNode;
  /** A second, muted line under the label. */
  description?: ReactNode;
}

const row =
  'flex min-h-touch cursor-pointer items-start gap-3 py-2.5 text-body text-default has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted';
const input = 'mt-0.5 h-5 w-5 shrink-0 accent-primary-600';

function ChoiceLabel({ label, description }: Pick<ChoiceProps, 'label' | 'description'>) {
  return (
    <span className="flex flex-col">
      <span>{label}</span>
      {description ? (
        <span className="text-body-sm text-muted">{description}</span>
      ) : null}
    </span>
  );
}

/** DS 02 checkbox: a native 20 px input in a 44 px row, ticked in primary 600. */
export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(
  ({ label, description, className, ...props }, ref) => (
    <label className={cn(row, className)}>
      <input ref={ref} type="checkbox" className={input} {...props} />
      <ChoiceLabel label={label} description={description} />
    </label>
  ),
);
Checkbox.displayName = 'Checkbox';

/** DS 02 radio; group radios with `RadioGroup` (arrow keys move within it natively). */
export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(
  ({ label, description, className, ...props }, ref) => (
    <label className={cn(row, className)}>
      <input ref={ref} type="radio" className={input} {...props} />
      <ChoiceLabel label={label} description={description} />
    </label>
  ),
);
Radio.displayName = 'Radio';

export interface RadioGroupProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  legend: ReactNode;
  /** An error for the whole group; it is announced and tied to the group. */
  error?: ReactNode;
}

/** A fieldset whose legend names the group of radios (or checkboxes) it holds. */
export function RadioGroup({
  legend,
  error,
  id,
  className,
  children,
  ...props
}: RadioGroupProps) {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      aria-describedby={errorId}
      className={cn('flex flex-col', className)}
      {...props}
    >
      <legend className="mb-1 text-body-sm font-medium text-default">{legend}</legend>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-body-sm text-error-600">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
