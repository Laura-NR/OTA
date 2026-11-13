import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';

/** The attributes a control needs to belong to its field. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

export interface FieldProps {
  /** The control's id; the label, helper and error are tied to it. */
  id: string;
  label: ReactNode;
  /** Helper text under the control; an error replaces it rather than stacking. */
  hint?: ReactNode;
  /** The error message. It says what to do, in one sentence (T-Forms §00). */
  error?: ReactNode;
  required?: boolean;
  /** A marker after the label, such as "Required" or "Optional", in the page's language. */
  requirement?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * DS 02 / T-Forms §00 field: label above (14/20 medium), control, then helper
 * (12/16 muted) or error (icon + text, `role="alert"`). The label never turns
 * red; the control gets `aria-invalid` and `aria-describedby`.
 *
 * ```tsx
 * <Field id="email" label={t('email')} error={errors.email}>
 *   {(control) => <Input type="email" autoComplete="email" {...control} />}
 * </Field>
 * ```
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  requirement,
  className,
  children,
}: FieldProps) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body-sm font-medium text-default">
        {label}
        {requirement ? (
          <span className="font-normal text-muted"> · {requirement}</span>
        ) : null}
      </label>
      {children({
        id,
        ...(messageId ? { 'aria-describedby': messageId } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(required ? { required: true } : {}),
      })}
      {error ? (
        <p
          id={messageId}
          role="alert"
          className="flex items-start gap-1.5 text-body-sm text-error-600"
        >
          <Icon name="alert-circle" className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={messageId} className="text-caption font-normal text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
