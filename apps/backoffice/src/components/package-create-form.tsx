'use client';

import type { InventoryItemDto, PackageDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Build a curated package from catalog items (spec §3.3). */
export function PackageCreateForm({ items }: { items: InventoryItemDto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState<Record<string, number>>({});

  function toggle(id: string) {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
    setDays((previous) => ({ ...previous, [id]: previous[id] ?? 1 }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      await apiRequest<PackageDto>('/packages', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          description: form.get('description') || undefined,
          province: form.get('province') || undefined,
          durationDays: Number(form.get('durationDays') || 1),
          currency: form.get('currency') || 'EUR',
          basePrice: Number(form.get('basePrice') || 0),
          services: selected.map((inventoryItemId, index) => ({
            inventoryItemId,
            dayOffset: (days[inventoryItemId] ?? 1) - 1,
            position: index,
          })),
        }),
      });
      event.currentTarget.reset();
      setSelected([]);
      setDays({});
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Could not create package',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New curated package</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="package-name">Name</Label>
              <Input id="package-name" name="name" required maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="package-province">Province</Label>
              <Input id="package-province" name="province" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="package-days">Duration (days)</Label>
              <Input
                id="package-days"
                name="durationDays"
                type="number"
                min="1"
                max="60"
                defaultValue={3}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="package-price">Base price</Label>
              <Input
                id="package-price"
                name="basePrice"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="package-currency">Currency</Label>
              <Input
                id="package-currency"
                name="currency"
                defaultValue="EUR"
                maxLength={3}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="package-description">Description</Label>
              <Input id="package-description" name="description" maxLength={2000} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Included services</Label>
            {items.length === 0 ? (
              <Alert>Create catalog items first — a package is built from them.</Alert>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {items.map((item) => {
                  const checked = selected.includes(item.id);
                  return (
                    <li key={item.id} className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="flex-1">
                        {item.name}{' '}
                        <span className="text-muted-foreground">
                          · {item.province ?? 'Cuba'}
                        </span>
                      </span>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        Day
                        <Input
                          type="number"
                          min="1"
                          max="60"
                          className="h-8 w-16"
                          disabled={!checked}
                          value={days[item.id] ?? 1}
                          onChange={(event) =>
                            setDays((previous) => ({
                              ...previous,
                              [item.id]: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error ? <Alert variant="destructive">{error}</Alert> : null}

          <Button type="submit" disabled={busy || selected.length === 0}>
            {busy ? 'Creating…' : 'Create package'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
