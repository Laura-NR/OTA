'use client';

import type { InventoryItemDto } from '@ota/schemas';
import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Edit a catalog item and toggle its storefront visibility (spec §4.6). */
export function InventoryEditForm({ item }: { item: InventoryItemDto }) {
  const t = useTranslations('backoffice.forms');
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
        updateError instanceof Error ? updateError.message : t('updateItemFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-type">{t('type')}</Label>
          <Select id="edit-type" name="type" defaultValue={item.type} required>
            <option value="ACCOMMODATION">{t('accommodation')}</option>
            <option value="TRANSPORT">{t('transport')}</option>
            <option value="EXPERIENCE">{t('experience')}</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-name">{t('name')}</Label>
          <Input id="edit-name" name="name" defaultValue={item.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-province">{t('province')}</Label>
          <Input id="edit-province" name="province" defaultValue={item.province ?? ''} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-base-price">{t('basePrice')}</Label>
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
          <Label htmlFor="edit-currency">{t('currency')}</Label>
          <Input
            id="edit-currency"
            name="currency"
            defaultValue={item.currency}
            maxLength={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-description">{t('description')}</Label>
          <Input
            id="edit-description"
            name="description"
            defaultValue={item.description ?? ''}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={item.active} />
        {t('visible')}
      </label>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {saved ? <Alert variant="success">{t('catalogSaved')}</Alert> : null}

      <Button type="submit" disabled={busy}>
        {busy ? t('saving') : t('saveChanges')}
      </Button>
    </form>
  );
}
