'use client';

import type { InventoryItemDto } from '@ota/schemas';
import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Edit a catalog item and toggle its storefront visibility (spec §4.6). */
export function InventoryEditForm({ item }: { item: InventoryItemDto }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      await apiRequest(`/inventory/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          type: form.get('type'),
          name: form.get('name'),
          province: form.get('province') || undefined,
          currency: form.get('currency') || 'EUR',
          basePrice: Number(form.get('basePrice')),
          description: form.get('description') || undefined,
          active: form.get('active') === 'on',
        }),
      });
      setSaved(true);
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : 'Could not update item',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-type">Type</Label>
          <Select id="edit-type" name="type" defaultValue={item.type} required>
            <option value="ACCOMMODATION">Accommodation</option>
            <option value="TRANSPORT">Transport</option>
            <option value="EXPERIENCE">Experience</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" name="name" defaultValue={item.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-province">Province</Label>
          <Input id="edit-province" name="province" defaultValue={item.province ?? ''} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-base-price">Base price</Label>
          <Input
            id="edit-base-price"
            name="basePrice"
            type="number"
            min="0"
            step="0.01"
            defaultValue={Number(item.basePrice).toFixed(2)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-currency">Currency</Label>
          <Input
            id="edit-currency"
            name="currency"
            defaultValue={item.currency}
            maxLength={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-description">Description</Label>
          <Input
            id="edit-description"
            name="description"
            defaultValue={item.description ?? ''}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={item.active} />
        Visible in the storefront catalog
      </label>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {saved ? <Alert variant="success">Catalog item saved.</Alert> : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
