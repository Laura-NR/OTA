import type { ReservationDto } from '@ota/schemas';
import { Button, Label, Select } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

export interface ReservationPickerProps {
  id: string;
  action: string;
  reservations: ReservationDto[];
  selectedId?: string;
}

/**
 * Plain GET form that selects a reservation and reloads the current page with
 * `?reservation=<id>`. Server-rendered, so it works without client JS.
 */
export async function ReservationPicker({
  id,
  action,
  reservations,
  selectedId,
}: ReservationPickerProps) {
  const t = await getTranslations('backoffice.picker');

  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      <div className="space-y-2">
        <Label htmlFor={id}>{t('label')}</Label>
        <Select
          id={id}
          name="reservation"
          defaultValue={selectedId ?? ''}
          className="min-w-72"
        >
          <option value="">{t('placeholder')}</option>
          {reservations.map((reservation) => (
            <option key={reservation.id} value={reservation.id}>
              {reservation.bookingCode} — {reservation.status}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        {t('open')}
      </Button>
    </form>
  );
}
