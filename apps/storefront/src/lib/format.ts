/**
 * A price in the visitor's locale ("€1,290" in English, "1290 €" in Spanish):
 * whole amounts drop the cents, as the boards draw them.
 */
export function formatMoney(
  amount: string | number,
  currency: string,
  locale: string,
): string {
  const value = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Node and the browser ship different ICU data, which differ in the spaces
 * they put in numbers and dates (narrow no-break, no-break or thin). A client
 * component renders on both, so its formatted text uses plain spaces to
 * hydrate cleanly.
 */
export function plainSpaces(text: string): string {
  return text.replace(/[\u00a0\u2009\u202f]/g, ' ');
}

/** A calendar date stored at UTC midnight ("13 Feb 2027"), read in UTC. */
export function formatDay(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
