'use client';

import type { AvailabilityDayDto } from '@ota/schemas';
import { Alert, Button, cn } from '@ota/ui';
import { useEffect, useMemo, useState } from 'react';

import { apiRequest } from '@/lib/client-api';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Per-day worker availability (spec §5.2): single-tap toggle with granular
 * blocking. Days without a stored override are available by default.
 */
export function AvailabilityCalendar({
  supplierId,
  canEdit,
}: {
  supplierId: string;
  canEdit: boolean;
}) {
  const [cursor, setCursor] = useState(
    () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)),
  );
  const [days, setDays] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { from, to, lead, cells, label } = useMemo(() => {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const last = new Date(Date.UTC(year, month + 1, 0));
    const dates: Date[] = [];
    for (let day = 1; day <= last.getUTCDate(); day += 1) {
      dates.push(new Date(Date.UTC(year, month, day)));
    }
    return {
      from: isoDate(first),
      to: isoDate(last),
      lead: (first.getUTCDay() + 6) % 7,
      cells: dates,
      label: first.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    };
  }, [cursor]);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(null);
    apiRequest<AvailabilityDayDto[]>(
      `/suppliers/${supplierId}/availability?from=${from}&to=${to}`,
    )
      .then((rows) => {
        if (!active) return;
        const next: Record<string, boolean> = {};
        for (const row of rows) {
          next[row.date] = row.isAvailable;
        }
        setDays(next);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load availability',
          );
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [supplierId, from, to]);

  async function toggle(day: Date) {
    if (!canEdit || busy) return;
    const key = isoDate(day);
    const next = !(days[key] ?? true);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/availability`, {
        method: 'PUT',
        body: JSON.stringify({ date: key, isAvailable: next }),
      });
      setDays((previous) => ({ ...previous, [key]: next }));
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Could not update availability',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setCursor(
              (current) =>
                new Date(
                  Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1),
                ),
            )
          }
        >
          ←
        </Button>
        <span className="text-sm font-medium">{label}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setCursor(
              (current) =>
                new Date(
                  Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1),
                ),
            )
          }
        >
          →
        </Button>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1 font-medium text-muted-foreground">
            {weekday}
          </div>
        ))}
        {Array.from({ length: lead }).map((_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {cells.map((day) => {
          const key = isoDate(day);
          const available = days[key] ?? true;
          return (
            <button
              key={key}
              type="button"
              disabled={!canEdit || busy}
              onClick={() => toggle(day)}
              data-date={key}
              title={available ? 'Available' : 'Blocked'}
              className={cn(
                'rounded py-2 transition-colors',
                available
                  ? 'bg-success/20 hover:bg-success/30'
                  : 'bg-destructive/20 text-muted-foreground line-through hover:bg-destructive/30',
                (!canEdit || busy) && 'cursor-not-allowed opacity-60',
              )}
            >
              {day.getUTCDate()}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Green = available · red = blocked. A day with no override is available.
      </p>
    </div>
  );
}
