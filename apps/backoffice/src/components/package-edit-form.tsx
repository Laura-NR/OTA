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
  Select,
} from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

interface ServiceRow {
  inventoryItemId: string;
  dayOffset: number;
}

/** Edit a curated package and its itinerary (spec §3.3). */
export function PackageEditForm({
  package: pkg,
  items,
}: {
  package: PackageDto;
  items: InventoryItemDto[];
}) {
  const router = useRouter();
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? '');
  const [province, setProvince] = useState(pkg.province ?? '');
  const [durationDays, setDurationDays] = useState(String(pkg.durationDays));
  const [currency, setCurrency] = useState(pkg.currency);
  const [basePrice, setBasePrice] = useState(pkg.basePrice);
  const [active, setActive] = useState(pkg.active);
  const [rows, setRows] = useState<ServiceRow[]>(
    [...pkg.services]
      .sort((a, b) => a.dayOffset - b.dayOffset || a.position - b.position)
      .map((service) => ({
        inventoryItemId: service.inventoryItemId,
        dayOffset: service.dayOffset,
      })),
  );
  const [newItemId, setNewItemId] = useState(items[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemName = (id: string) => items.find((item) => item.id === id)?.name ?? id;

  function addService() {
    if (!newItemId) return;
    setRows((current) => [...current, { inventoryItemId: newItemId, dayOffset: 0 }]);
  }

  function removeService(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function setDay(index: number, day: number) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, dayOffset: day } : row)),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      await apiRequest<PackageDto>(`/packages/${pkg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          description: description || undefined,
          province: province || undefined,
          durationDays: Number(durationDays),
          currency,
          basePrice: Number(basePrice),
          active,
          services: rows.map((row, index) => ({
            inventoryItemId: row.inventoryItemId,
            dayOffset: row.dayOffset,
            position: index,
          })),
        }),
      });
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save package');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-province">Province</Label>
              <Input
                id="edit-province"
                value={province}
                onChange={(event) => setProvince(event.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-days">Duration (days)</Label>
              <Input
                id="edit-days"
                type="number"
                min="1"
                max="60"
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">Base price</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                value={basePrice}
                onChange={(event) => setBasePrice(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-currency">Currency</Label>
              <Input
                id="edit-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                maxLength={3}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Active
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itinerary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <Alert>A package needs at least one service.</Alert>
          ) : (
            <ul className="space-y-2">
              {rows.map((row, index) => (
                <li
                  key={`${row.inventoryItemId}-${index}`}
                  className="flex items-center gap-3 rounded-md border p-2 text-sm"
                >
                  <span className="flex-1 font-medium">
                    {itemName(row.inventoryItemId)}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Day
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      className="h-8 w-16"
                      value={row.dayOffset + 1}
                      onChange={(event) =>
                        setDay(index, Math.max(1, Number(event.target.value)) - 1)
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeService(index)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="edit-add-item">Add a service</Label>
              <Select
                id="edit-add-item"
                value={newItemId}
                onChange={(event) => setNewItemId(event.target.value)}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addService}
              disabled={!newItemId}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {saved ? <Alert>Package saved.</Alert> : null}

      <Button type="submit" disabled={busy || rows.length === 0}>
        {busy ? 'Saving…' : 'Save package'}
      </Button>
    </form>
  );
}
