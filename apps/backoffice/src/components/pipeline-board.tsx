import { RESERVATION_STATUSES } from '@ota/domain';
import type { ReservationStatus } from '@ota/domain';
import type { ReservationListItemDto } from '@ota/schemas';
import { Alert } from '@ota/ui';
import Link from 'next/link';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

/**
 * The operations pipeline as a status board (spec §4.1). Server-rendered; each
 * card deep-links to the reservation workbench.
 */
export function PipelineBoard({
  reservations,
}: {
  reservations: ReservationListItemDto[];
}) {
  if (reservations.length === 0) {
    return (
      <Alert>
        No reservations yet. Create one, or run the seed, to populate the pipeline.
      </Alert>
    );
  }

  const byStatus = new Map<ReservationStatus, ReservationListItemDto[]>(
    RESERVATION_STATUSES.map((status) => [status, []]),
  );
  for (const reservation of reservations) {
    byStatus.get(reservation.status)?.push(reservation);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {RESERVATION_STATUSES.map((status) => {
        const rows = byStatus.get(status) ?? [];
        return (
          <div key={status} className="w-64 shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {status.replaceAll('_', ' ')}
              </span>
              <span className="text-xs text-muted-foreground">{rows.length}</span>
            </div>
            <div className="space-y-2">
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                rows.map((reservation) => (
                  <Link
                    key={reservation.id}
                    href={`/reservations/${reservation.id}`}
                    className="block rounded-md border bg-card p-3 text-sm shadow-sm transition-colors hover:border-primary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{reservation.bookingCode}</span>
                      <span className="text-xs text-muted-foreground">
                        {reservation.serviceItemCount} item(s)
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {reservation.travelerName ?? reservation.travelerEmail}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(reservation.startDate)} →{' '}
                      {formatDate(reservation.endDate)}
                    </div>
                    <div className="mt-1 text-xs font-medium">
                      {reservation.totalCurrency}{' '}
                      {Number(reservation.totalAmount).toFixed(2)}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
