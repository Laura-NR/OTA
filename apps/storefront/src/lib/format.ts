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
