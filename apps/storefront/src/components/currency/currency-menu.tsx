'use client';

import type { ShownCurrency } from '@ota/domain';
import { Icon, Radio, RadioGroup, cn } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { plainSpaces } from '@/lib/format';

import { useCurrency } from './currency-provider';

/** "Canadian dollar", in the page's language. */
function currencyName(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
}

/** "1 € = 1.4891": the rate shown, spread included, to four places. */
function rateText(rate: number, locale: string): string {
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rate);
  return plainSpaces(`1 € = ${value}`);
}

function useNote(): string {
  const t = useTranslations('currency');
  const { display } = useCurrency();
  return display.lockAt === 'INVOICE' ? t('noteInvoice') : t('noteDeposit');
}

/**
 * The display-currency choice (`docs/schema-m9-display-currencies.md` C7a,
 * DS-Actions-Forms "Currency & language switchers"). The header's `menu` is a
 * button that opens a listbox (DS-Handoff: aria-haspopup="listbox", arrow
 * keys, Esc closes and returns focus); the drawer and Account show the same
 * choice as a radio group (`list`); `compact` names it as the drawer names its
 * sections. Nothing renders while only EUR is offered.
 */
export function CurrencyMenu({
  variant = 'menu',
  compact = false,
  className,
}: {
  variant?: 'menu' | 'list';
  compact?: boolean;
  className?: string;
}) {
  const { display } = useCurrency();
  if (display.options.length < 2) return null;
  return variant === 'menu' ? (
    <CurrencyListbox className={className} />
  ) : (
    <CurrencyRadios compact={compact} className={className} />
  );
}

function CurrencyListbox({ className }: { className?: string }) {
  const t = useTranslations('currency');
  const locale = useLocale();
  const { display, pending, choose } = useCurrency();
  const note = useNote();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const noteId = useId();
  const options = display.options;

  useEffect(() => {
    if (!open) return;
    list.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
  };
  const current = Math.max(
    0,
    options.findIndex((option) => option.code === display.code),
  );
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const pick = (code: ShownCurrency) => {
    close();
    void choose(code);
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(current);
    }
  };
  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]!);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t('menuLabel', { code: display.code })}
        aria-busy={pending || undefined}
        onClick={() => (open ? close() : openAt(current))}
        onKeyDown={onButtonKey}
        className="relative flex h-8 items-center gap-1 rounded px-1.5 text-caption uppercase text-muted transition-colors hover:text-default pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:content-['']"
      >
        {display.code}
        <Icon name="chevron-down" className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[260px] rounded-md border bg-surface shadow-md">
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={t('label')}
            aria-describedby={noteId}
            onKeyDown={onListKey}
            className="flex flex-col py-1"
          >
            {options.map((option, index) => {
              const selected = option.code === display.code;
              return (
                <li
                  key={option.code}
                  role="option"
                  aria-selected={selected}
                  tabIndex={index === active ? 0 : -1}
                  onClick={() => pick(option.code)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      pick(option.code);
                    }
                  }}
                  data-analytics-event="locale_changed"
                  data-analytics-from={display.code}
                  data-analytics-to={option.code}
                  data-analytics-kind="currency"
                  className={cn(
                    'flex cursor-pointer flex-col px-3 py-2.5 text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                    selected
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-default hover:bg-neutral-100',
                  )}
                >
                  <span>
                    <span className="font-mono font-semibold">{option.code}</span> ·{' '}
                    {currencyName(option.code, locale)}
                  </span>
                  <span className="text-caption text-muted">
                    {option.rate === null ? t('base') : rateText(option.rate, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p id={noteId} className="border-t px-3 py-2.5 text-caption text-muted">
            {note}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CurrencyRadios({
  compact,
  className,
}: {
  compact: boolean;
  className?: string;
}) {
  const t = useTranslations('currency');
  const locale = useLocale();
  const { display, pending, choose } = useCurrency();
  const note = useNote();
  const name = useId();

  return (
    <RadioGroup
      legend={
        compact ? (
          <span className="text-overline uppercase text-muted">{t('label')}</span>
        ) : (
          t('label')
        )
      }
      className={className}
      aria-busy={pending || undefined}
    >
      {display.options.map((option) => (
        <Radio
          key={option.code}
          name={name}
          value={option.code}
          checked={option.code === display.code}
          onChange={() => void choose(option.code)}
          label={`${option.code} · ${currencyName(option.code, locale)}`}
          description={option.rate === null ? t('base') : rateText(option.rate, locale)}
          data-analytics-event="locale_changed"
          data-analytics-from={display.code}
          data-analytics-to={option.code}
          data-analytics-kind="currency"
        />
      ))}
      <p className="text-caption text-muted">{note}</p>
    </RadioGroup>
  );
}
