'use client';

import { BASE_CURRENCY } from '@ota/domain';
import type { DisplayRateLockDto } from '@ota/schemas';
import { cn } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';

import { approxPrice, browsingPrice } from '@/lib/display-money';
import { plainSpaces } from '@/lib/format';

import { useDisplayMoney } from './currency-provider';

/**
 * "≈ CA$918 · the rate locks when you pay the deposit" beside a payable EUR
 * amount (`docs/schema-m9-display-currencies.md` C1a, C6a). With the
 * booking's lock it reads "rate locked on 14 Oct 2026" at that rate. Nothing
 * renders while the visitor sees EUR and the booking has no lock.
 */
export function ApproxPrice({
  amount,
  currency,
  lock = null,
  className,
}: {
  amount: string | number;
  currency: string;
  lock?: DisplayRateLockDto | null;
  className?: string;
}) {
  const t = useTranslations('currency');
  const locale = useLocale();
  const display = useDisplayMoney();
  const approx = approxPrice(amount, currency, display, locale, lock);
  if (!approx) return null;
  const when = lock
    ? t('locked', {
        date: plainSpaces(
          new Intl.DateTimeFormat(locale, {
            timeZone: 'UTC',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(new Date(lock.lockedAt)),
        ),
      })
    : t(display.lockAt === 'INVOICE' ? 'locksAtInvoice' : 'locksAtDeposit');
  return (
    <span className={cn('text-caption text-muted', className)}>
      {plainSpaces(approx)} · {when}
    </span>
  );
}

/** A browsing price (C1a) in the visitor's display currency, for any parent. */
export function BrowsingPrice({
  amount,
  currency,
}: {
  amount: string | number;
  currency: string;
}) {
  const locale = useLocale();
  const display = useDisplayMoney();
  return <>{plainSpaces(browsingPrice(amount, currency, display, locale))}</>;
}

/** "Prices set in EUR", shown only while another currency is displayed (DS-Handoff). */
export function PricesSetInEur({ className }: { className?: string }) {
  const t = useTranslations('currency');
  const display = useDisplayMoney();
  if (display.code === BASE_CURRENCY) return null;
  return (
    <p className={cn('text-caption text-muted', className)}>{t('pricesSetInEur')}</p>
  );
}

/**
 * A translated sentence around a browsing price ("From {price}"), for
 * components that render on the server as well as in the browser.
 */
export function PriceMessage({
  namespace,
  message,
  amount,
  currency,
  argument = 'price',
  values = {},
}: {
  namespace: string;
  message: string;
  amount: string | number;
  currency: string;
  /** The message's placeholder for the price. */
  argument?: string;
  values?: Record<string, string | number>;
}) {
  const t = useTranslations(namespace);
  const locale = useLocale();
  const display = useDisplayMoney();
  return (
    <>
      {t(message, {
        ...values,
        [argument]: plainSpaces(browsingPrice(amount, currency, display, locale)),
      })}
    </>
  );
}
