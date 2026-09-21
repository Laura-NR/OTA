'use client';

import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

export function InventoryCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      await apiRequest('/inventory', {
        method: 'POST',
        body: JSON.stringify({
          type: form.get('type'),
          name: form.get('name'),
          province: form.get('province') || undefined,
          currency: form.get('currency') || 'EUR',
          basePrice: Number(form.get('basePrice')),
          description: form.get('description') || undefined,
        }),
      });
      formElement.reset();
      setSaved(true);
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Could not create item',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="inventory-type">Type</Label>
          <Select id="inventory-type" name="type" defaultValue="ACCOMMODATION" required>
            <option value="ACCOMMODATION">Accommodation</option>
            <option value="TRANSPORT">Transport</option>
            <option value="EXPERIENCE">Experience</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-name">Name</Label>
          <Input
            id="inventory-name"
            name="name"
            required
            placeholder="Casa particular Vedado"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-province">Province</Label>
          <Input id="inventory-province" name="province" placeholder="La Habana" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-base-price">Base price</Label>
          <Input
            id="inventory-base-price"
            name="basePrice"
            type="number"
            min="0"
            step="0.01"
            required
            placeholder="45.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-currency">Currency</Label>
          <Input
            id="inventory-currency"
            name="currency"
            defaultValue="EUR"
            maxLength={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-description">Description</Label>
          <Input
            id="inventory-description"
            name="description"
            placeholder="Optional notes"
          />
        </div>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {saved ? <Alert variant="success">Catalog item created.</Alert> : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Add item'}
      </Button>
    </form>
  );
}
