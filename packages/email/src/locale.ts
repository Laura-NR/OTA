export type EmailLocale = 'en' | 'es' | 'fr';

const LOCALES: readonly EmailLocale[] = ['en', 'es', 'fr'];

/** The tenant's traveler locales; anything else reads English. */
export function emailLocale(value?: string | null): EmailLocale {
  const base = (value ?? 'en').trim().toLowerCase().split(/[-_]/)[0];
  return LOCALES.includes(base as EmailLocale) ? (base as EmailLocale) : 'en';
}

function plainSpaces(text: string): string {
  return text.replace(/[\u00a0\u2009\u202f]/g, ' ');
}

export function emailMoney(
  amount: number | string,
  currency: string,
  locale: EmailLocale,
): string {
  return plainSpaces(
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount)),
  );
}

/** A calendar date stored at UTC midnight ("13 February 2027"). */
export function emailDate(value: Date | string, locale: EmailLocale): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(value)),
  );
}

export function emailList(values: readonly string[], locale: EmailLocale): string {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format([
    ...values,
  ]);
}

/**
 * An instant such as a payment window's end, read in UTC (or the given IANA
 * zone, such as a deadline in Havana time) and labelled with its zone.
 */
export function emailInstant(
  value: Date | string,
  locale: EmailLocale,
  timeZone = 'UTC',
): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    }).format(new Date(value)),
  );
}

/** A trip's calendar days, stored at UTC midnight ("13–20 February 2027"). */
export function emailDateRange(
  start: Date | string,
  end: Date | string,
  locale: EmailLocale,
): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).formatRange(
      new Date(start),
      new Date(end),
    ),
  );
}
