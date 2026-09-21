import type { ReservationDto } from '@ota/schemas';
import { Button, Label, Select } from '@ota/ui';

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
export function ReservationPicker({
  id,
  action,
  reservations,
  selectedId,
}: ReservationPickerProps) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      <div className="space-y-2">
        <Label htmlFor={id}>Reservation</Label>
        <Select
          id={id}
          name="reservation"
          defaultValue={selectedId ?? ''}
          className="min-w-72"
        >
          <option value="">Select a reservation…</option>
          {reservations.map((reservation) => (
            <option key={reservation.id} value={reservation.id}>
              {reservation.bookingCode} — {reservation.status}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        Open
      </Button>
    </form>
  );
}
