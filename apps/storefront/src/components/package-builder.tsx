'use client';

import type { InventoryItemDto } from '@ota/schemas';
import { Alert, Badge, Button, Card, CardContent, Input, Label } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

const STEPS = ['Dates', 'Stays', 'Transport', 'Experiences', 'Review'] as const;

function ItemPicker({
  items,
  selected,
  onToggle,
}: {
  items: InventoryItemDto[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) {
    return <Alert>No options in this category yet — continue to the next step.</Alert>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const checked = selected.includes(item.id);
        return (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.id)}
              />
              {item.media[0] ? (
                <img
                  src={`/api/ota/catalog/media/${item.media[0].id}`}
                  alt={item.media[0].altText ?? item.name}
                  className="h-10 w-16 rounded object-cover"
                />
              ) : null}
              <span className="flex-1 font-medium">{item.name}</span>
              <span className="text-muted-foreground">{item.province ?? 'Cuba'}</span>
              <span>
                {item.currency} {Number(item.basePrice).toFixed(2)}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Five-step dynamic package builder (spec §4.2): dates, then stays, transport,
 * and experiences from the published catalog, then review. Submitting creates
 * an ITINERARY_SUBMITTED booking for the signed-in traveler.
 */
export function PackageBuilder({ items }: { items: InventoryItemDto[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byType = useMemo(
    () => ({
      ACCOMMODATION: items.filter((item) => item.type === 'ACCOMMODATION'),
      TRANSPORT: items.filter((item) => item.type === 'TRANSPORT'),
      EXPERIENCE: items.filter((item) => item.type === 'EXPERIENCE'),
    }),
    [items],
  );

  const selectedItems = items.filter((item) => selected.includes(item.id));
  const total = selectedItems.reduce((sum, item) => sum + Number(item.basePrice), 0);
  const datesValid =
    Boolean(startDate && endDate) && new Date(endDate) >= new Date(startDate);

  function toggle(id: string) {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/ota/me/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          serviceItems: selected.map((inventoryItemId) => ({ inventoryItemId })),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `Request failed (${response.status})`);
      }
      const reservation = (await response.json()) as { id: string };
      router.push(`/account/reservations/${reservation.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not build the itinerary',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <ol className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, index) => (
            <li key={label}>
              <Badge variant={index === step ? 'default' : 'outline'}>
                {index + 1}. {label}
              </Badge>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="build-start">Start date</Label>
              <Input
                id="build-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="build-end">End date</Label>
              <Input
                id="build-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            {startDate && endDate && !datesValid ? (
              <Alert variant="destructive">
                The end date must be on or after the start date.
              </Alert>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <ItemPicker
            items={byType.ACCOMMODATION}
            selected={selected}
            onToggle={toggle}
          />
        ) : null}
        {step === 2 ? (
          <ItemPicker items={byType.TRANSPORT} selected={selected} onToggle={toggle} />
        ) : null}
        {step === 3 ? (
          <ItemPicker items={byType.EXPERIENCE} selected={selected} onToggle={toggle} />
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            {selectedItems.length === 0 ? (
              <Alert>Add at least one service before submitting.</Alert>
            ) : (
              <ul className="space-y-2 text-sm">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.name}{' '}
                      <span className="text-muted-foreground">
                        ({item.type.replaceAll('_', ' ')})
                      </span>
                    </span>
                    <span>
                      {item.currency} {Number(item.basePrice).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium">Estimated total: EUR {total.toFixed(2)}</p>
          </div>
        ) : null}

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            disabled={step === 0 || busy}
            onClick={() => setStep((value) => Math.max(value - 1, 0))}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              disabled={(step === 0 && !datesValid) || busy}
              onClick={() => setStep((value) => value + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button disabled={selected.length === 0 || busy} onClick={submit}>
              {busy ? 'Submitting…' : 'Submit itinerary'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
