'use client';

import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

export function InventoryCreateForm() {
  const t = useTranslations('backoffice.forms');
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
        createError instanceof Error ? createError.message : t('createItemFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="inventory-type">{t('type')}</Label>
          <Select id="inventory-type" name="type" defaultValue="ACCOMMODATION" required>
            <option value="ACCOMMODATION">{t('accommodation')}</option>
            <option value="TRANSPORT">{t('transport')}</option>
            <option value="EXPERIENCE">{t('experience')}</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-name">{t('name')}</Label>
          <Input
            id="inventory-name"
            name="name"
            required
            placeholder="Casa particular Vedado"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-province">{t('province')}</Label>
          <Input id="inventory-province" name="province" placeholder="La Habana" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-base-price">{t('basePrice')}</Label>
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
          <Label htmlFor="inventory-currency">{t('currency')}</Label>
          <Input
            id="inventory-currency"
            name="currency"
            defaultValue="EUR"
            maxLength={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-description">{t('description')}</Label>
          <Input
            id="inventory-description"
            name="description"
            placeholder="Optional notes"
          />
        </div>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {saved ? <Alert variant="success">{t('catalogCreated')}</Alert> : null}

      <Button type="submit" disabled={busy}>
        {busy ? t('saving') : t('addItem')}
      </Button>
    </form>
  );
}
