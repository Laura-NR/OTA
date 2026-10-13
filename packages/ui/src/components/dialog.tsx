'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { buttonClassName } from './button';
import { Icon } from './icon';

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogProps {
  open: boolean;
  /** Called when the dialog asks to close (Esc, the close button); the caller sets `open`. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Accessible name of the close button, in the page's language. */
  closeLabel: string;
  /** Actions, right-aligned under a rule. */
  footer?: ReactNode;
  size?: DialogSize;
  children?: ReactNode;
}

const widths: Record<DialogSize, string> = {
  sm: 'md:w-[480px]',
  md: 'md:w-[640px]',
  lg: 'md:w-[960px]',
};

/**
 * DS 06 modal on the native `<dialog>`: modal, so the page behind is inert and
 * Esc closes it; focus moves in on open and the browser returns it on close.
 * 480 / 640 / 960 px wide from `md`, a bottom sheet below it, over a 50 % ink
 * backdrop.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  closeLabel,
  footer,
  size = 'md',
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        'max-h-[90vh] w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-surface p-0 text-default shadow-lg backdrop:bg-neutral-900/50',
        'max-md:mb-0 max-md:max-w-none max-md:rounded-b-none',
        widths[size],
      )}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-h3 text-default">
            {title}
          </h2>
          {description ? (
            <p id={`${id}-description`} className="text-body-sm text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className={buttonClassName({ variant: 'tertiary', size: 'icon' })}
        >
          <Icon name="x" />
        </button>
      </div>
      {children ? <div className="px-6 py-4">{children}</div> : null}
      {footer ? (
        <div className="flex flex-wrap justify-end gap-3 border-t px-6 py-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
