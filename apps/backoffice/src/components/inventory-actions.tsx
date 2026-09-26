'use client';

import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Hard-delete a catalog item (spec §4.6 full CRUD). */
export function InventoryActions({
  inventoryItemId,
  name,
}: {
  inventoryItemId: string;
  name: string;
}) {
  const t = useTranslations('backoffice.forms');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(t('deleteConfirm', { name }))) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/inventory/${inventoryItemId}`, { method: 'DELETE' });
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('deleteFailed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button size="sm" variant="destructive" disabled={pending} onClick={remove}>
        {pending ? t('deleting') : t('delete')}
      </Button>
    </div>
  );
}
