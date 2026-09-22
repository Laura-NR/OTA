'use client';

import { Alert, Button } from '@ota/ui';
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
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(`Delete “${name}”? This also removes its images and pricing rules.`)
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/inventory/${inventoryItemId}`, { method: 'DELETE' });
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Could not delete item',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button size="sm" variant="destructive" disabled={pending} onClick={remove}>
        {pending ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  );
}
