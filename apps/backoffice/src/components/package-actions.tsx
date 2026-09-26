'use client';

import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export interface PackageActionsProps {
  packageId: string;
  active: boolean;
  canManage: boolean;
}

/** Activate/deactivate and delete a curated package from the list. */
export function PackageActions({ packageId, active, canManage }: PackageActionsProps) {
  const t = useTranslations('backoffice.forms');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return null;
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(() =>
              apiRequest(`/packages/${packageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ active: !active }),
              }),
            )
          }
        >
          {active ? t('deactivate') : t('activate')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() =>
            run(() => apiRequest(`/packages/${packageId}`, { method: 'DELETE' }))
          }
        >
          {t('delete')}
        </Button>
      </div>
    </div>
  );
}
