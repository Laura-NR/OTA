import type { ReservationPriceLinesDto } from '@ota/schemas';
import { getLocale, getTranslations } from 'next-intl/server';

import { moneyExact } from '@/lib/ops-format';

/**
 * A booking's frozen price lines (A-Booking "Price breakdown"): each line with
 * its quantity and amount, then the total. These are the lines the invoice
 * prints, so the desk reads the same figures the traveler will.
 */
export async function PriceBreakdown({
  lines,
  priced,
}: {
  lines: ReservationPriceLinesDto;
  priced: boolean;
}) {
  const t = await getTranslations('backoffice.reservation.price');
  const locale = await getLocale();

  if (lines.lines.length === 0) {
    return <p className="text-body-sm text-muted">{priced ? t('empty') : t('custom')}</p>;
  }

  return (
    <table className="w-full text-body-sm">
      <thead className="sr-only">
        <tr>
          <th scope="col">{t('item')}</th>
          <th scope="col">{t('amount')}</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {lines.lines.map((line) => (
          <tr key={line.id}>
            <td className="py-2 pr-4">
              <span className="font-medium">{t(`kinds.${line.kind}`)}</span>
              <span className="text-secondary"> · {line.label}</span>
              <span className="block text-caption text-muted">
                {t('quantity', {
                  quantity: Number(line.quantity),
                  unitAmount: moneyExact(Number(line.unitAmount), line.currency, locale),
                })}
              </span>
            </td>
            <td className="whitespace-nowrap py-2 text-right font-mono">
              {moneyExact(Number(line.amount), line.currency, locale)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2">
          <th scope="row" className="py-2 pr-4 text-left font-semibold">
            {t('total')}
          </th>
          <td className="whitespace-nowrap py-2 text-right font-mono font-semibold">
            {moneyExact(Number(lines.total), lines.currency, locale)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
