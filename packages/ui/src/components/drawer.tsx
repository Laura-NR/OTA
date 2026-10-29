'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

import { buttonClassName } from './button';
import { Icon } from './icon';

export interface DrawerProps {
  open: boolean;
  /** Called when the drawer asks to close (Esc, the close button); the caller sets `open`. */
  onClose: () => void;
  title: ReactNode;
  /** Accessible name of the close button, in the page's language. */
  closeLabel: string;
  /**
   * Move focus to the title on open instead of the first control, so a screen
   * reader starts at what the panel is about (A-A11y 02).
   */
  focusTitle?: boolean;
  children?: ReactNode;
}

/**
 * DS 05 / DS 07 drawer: the right-hand panel on the native `<dialog>`, modal,
 * so focus stays inside and the page behind is inert; Esc closes it and the
 * browser returns focus on close. Focus moves to the first control on open, or
 * to the title with `focusTitle`. Full width on a phone, 384 px from `sm`, with
 * the close button top right.
 */
export function Drawer({
  open,
  onClose,
  title,
  closeLabel,
  focusTitle = false,
  children,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      if (focusTitle) {
        titleRef.current?.focus();
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, focusTitle]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-none overflow-y-auto bg-surface p-0 text-default shadow-lg backdrop:bg-neutral-900/50 sm:max-w-sm"
    >
      <div className="flex items-center justify-between gap-4 px-4 pt-3">
        <h2
          ref={titleRef}
          id={`${id}-title`}
          tabIndex={focusTitle ? -1 : undefined}
          className="text-body font-semibold text-default"
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className={buttonClassName({ variant: 'tertiary', size: 'icon' })}
        >
          <Icon name="x" />
        </button>
      </div>
      {children ? <div className="px-4 pb-6 pt-2">{children}</div> : null}
    </dialog>
  );
}
