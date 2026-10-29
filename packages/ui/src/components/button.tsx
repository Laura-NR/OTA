import { forwardRef, useId } from 'react';
import type { ButtonHTMLAttributes, MouseEvent } from 'react';

import { cn } from '../cn';
import { Icon } from './icon';

/** DS 02: one primary per view; destructive actions sit behind a confirm step. */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'link';

/** 32 / 40 / 48 px, plus a 44 px square for icon-only buttons (aria-label required). */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Busy while an action runs (`aria-busy`, disabled, a spinner). Pass the
   * in-progress label as the children, e.g. "Sending request…".
   */
  loading?: boolean;
  /**
   * Why the action is not available yet ("Choose a scenario first."). The
   * button keeps its label and its place in the tab order (`aria-disabled`),
   * refuses to act, and shows the reason beside it (A-A11y 04). Use `disabled`
   * only for a moment's busy state.
   */
  unavailableReason?: string;
}

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-button transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-200 disabled:text-muted aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-neutral-200 aria-disabled:text-muted';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-action-primary text-on-primary hover:bg-action-primary-hover active:bg-action-primary-active',
  secondary:
    'border-input bg-surface text-primary-700 hover:bg-neutral-100 active:bg-neutral-200',
  tertiary: 'bg-transparent text-primary-600 hover:bg-primary-100',
  destructive: 'bg-error-600 text-neutral-0 hover:bg-error-700',
  link: 'h-auto bg-transparent px-0 text-primary-600 underline underline-offset-[3px] hover:text-primary-700 disabled:bg-transparent aria-disabled:bg-transparent',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-body-sm font-semibold',
  md: 'h-10 px-4',
  lg: 'h-12 px-5',
  icon: 'h-touch w-touch px-0',
};

/**
 * The button classes for an element that is not a `<button>`, typically a link
 * that looks like an action (`<Link className={buttonClassName()}>`).
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return cn(base, sizes[size], variants[variant]);
}

/** Also stops a submit button, and the form's implicit submission on Enter. */
function refuseActivation(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      type = 'button',
      loading = false,
      disabled,
      unavailableReason,
      onClick,
      children,
      ...props
    },
    ref,
  ) => {
    const reasonId = useId();
    const unavailable = Boolean(unavailableReason) && !disabled && !loading;
    const describedBy = unavailable
      ? [props['aria-describedby'], reasonId].filter(Boolean).join(' ')
      : props['aria-describedby'];

    const button = (
      <button
        ref={ref}
        type={type}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        className={cn(buttonClassName({ variant, size }), className)}
        {...props}
        aria-disabled={unavailable || props['aria-disabled'] || undefined}
        aria-describedby={describedBy}
        onClick={unavailable ? refuseActivation : onClick}
      >
        {loading ? <Icon name="loader" className="animate-spin" /> : null}
        {children}
      </button>
    );

    return unavailable ? (
      <>
        {button}
        <span id={reasonId} className="text-caption text-muted">
          {unavailableReason}
        </span>
      </>
    ) : (
      button
    );
  },
);

Button.displayName = 'Button';
