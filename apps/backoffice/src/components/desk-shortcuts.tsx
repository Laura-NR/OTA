'use client';

import {
  Button,
  Dialog,
  Icon,
  isTypingTarget,
  resolveShortcut,
  Switch,
  type ShortcutMap,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

type ShortcutAction = 'help' | 'redispatch' | 'dashboard' | 'bookings' | 'payments';

const SHORTCUTS: ShortcutMap<ShortcutAction> = {
  keys: { '?': 'help', r: 'redispatch' },
  sequences: { g: { d: 'dashboard', b: 'bookings', p: 'payments' } },
};

const ROUTES: Partial<Record<ShortcutAction, string>> = {
  dashboard: '/dashboard',
  bookings: '/bookings',
  payments: '/payments',
};

/** How long the second key of "G then D" may take. */
const SEQUENCE_MS = 1500;

/** The device's choice, kept in the browser: shortcuts are on unless turned off here. */
const STORAGE_KEY = 'ota-desk-shortcuts';

/** Whether this device keeps the single-key shortcuts on (the default). */
export function shortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * A-A11y 01's desk shortcuts. The header's "Keyboard shortcuts" button and `?`
 * open the list. `G` then `D`, `B` or `P` goes to the Dashboard, Bookings or
 * Payments; `R` opens re-dispatch for the red (else amber) item of the row
 * that holds focus (rows and their buttons are marked `data-shortcut-row` and
 * `data-shortcut-redispatch`). Esc closing a panel is the native dialog's.
 * Nothing fires while the person types in a field, holds a modifier or has a
 * dialog open, and the list has a switch that turns the keys off on this
 * device (WCAG 2.1.4), for speech input users above all.
 */
export function DeskShortcuts() {
  const t = useTranslations('backoffice.shortcuts');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const pending = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchId = useId();

  useEffect(() => setEnabled(shortcutsEnabled()), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || document.querySelector('dialog[open]')) {
        return;
      }
      const result = resolveShortcut(
        event,
        pending.current,
        SHORTCUTS,
        isTypingTarget(event.target instanceof HTMLElement ? event.target : null),
      );
      pending.current = result.pending;
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      if (result.pending) {
        pendingTimer.current = setTimeout(() => {
          pending.current = null;
        }, SEQUENCE_MS);
      }
      if (!result.action) {
        return;
      }
      const route = ROUTES[result.action];
      if (route) {
        event.preventDefault();
        router.push(route);
      } else if (result.action === 'help') {
        event.preventDefault();
        setOpen(true);
      } else if (result.action === 'redispatch') {
        // The row's red item first, else its amber one.
        const row = document.activeElement?.closest('[data-shortcut-row]');
        const button =
          row?.querySelector<HTMLButtonElement>('[data-shortcut-redispatch="RED"]') ??
          row?.querySelector<HTMLButtonElement>('[data-shortcut-redispatch]');
        if (button) {
          event.preventDefault();
          button.click();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
    };
  }, [enabled, router]);

  function toggle(next: boolean) {
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // Without storage the choice lasts until the page reloads.
    }
  }

  const rows: ReadonlyArray<{ keys: string[]; does: string; where: string }> = [
    { keys: ['R'], does: t('rows.redispatch'), where: t('where.redispatch') },
    { keys: ['G', 'D'], does: t('rows.dashboard'), where: t('where.everywhere') },
    { keys: ['G', 'B'], does: t('rows.bookings'), where: t('where.everywhere') },
    { keys: ['G', 'P'], does: t('rows.payments'), where: t('where.everywhere') },
    { keys: ['Esc'], does: t('rows.close'), where: t('where.everywhere') },
    { keys: ['?'], does: t('rows.help'), where: t('where.everywhere') },
  ];

  return (
    <>
      <Button variant="tertiary" size="sm" onClick={() => setOpen(true)}>
        <Icon name="info" />
        {t('open')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('title')}
        description={t('description')}
        closeLabel={t('close')}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4 rounded-md border bg-page p-3">
            <div className="flex flex-col gap-0.5">
              <span id={`${switchId}-label`} className="text-body-sm font-semibold">
                {t('switch')}
              </span>
              <span id={`${switchId}-hint`} className="text-caption text-muted">
                {t('switchHint')}
              </span>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={toggle}
              aria-labelledby={`${switchId}-label`}
              aria-describedby={`${switchId}-hint`}
            />
          </div>
          <table className="w-full text-body-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b text-left text-secondary">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t('columns.keys')}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t('columns.does')}
                </th>
                <th scope="col" className="py-2 font-semibold">
                  {t('columns.where')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.keys.join('-')} className="border-b last:border-0">
                  <th scope="row" className="whitespace-nowrap py-2 pr-3 text-left">
                    {row.keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 ? (
                          <span className="font-normal text-muted"> {t('then')} </span>
                        ) : null}
                        <kbd className="rounded-sm border border-input bg-surface px-1.5 py-0.5 font-mono text-caption">
                          {key}
                        </kbd>
                      </span>
                    ))}
                  </th>
                  <td className="py-2 pr-3">{row.does}</td>
                  <td className="py-2 text-secondary">{row.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-caption text-muted">{t('typing')}</p>
        </div>
      </Dialog>
    </>
  );
}
