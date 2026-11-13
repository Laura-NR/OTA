'use client';

import { Alert, Button } from '@ota/ui';
import type { PackageStatusDto } from '@ota/schemas';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export interface PackageActionsProps {
  packageId: string;
  status: PackageStatusDto;
  canManage: boolean;
}

/** Publish/unpublish and delete a curated package from the list. */
export function PackageActions({ packageId, status, canManage }: PackageActionsProps) {
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

  const published = status === 'PUBLISHED';

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(() =>
              apiRequest(`/packages/${packageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: published ? 'DRAFT' : 'PUBLISHED' }),
              }),
            )
          }
        >
          {published ? t('unpublish') : t('publish')}
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
