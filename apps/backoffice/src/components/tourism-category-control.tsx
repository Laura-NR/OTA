'use client';

import { TOURISM_CATEGORIES, type TourismCategory } from '@ota/domain';
import { Alert, Button, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export interface TourismCategoryControlProps {
  reservationId: string;
  category: TourismCategory;
  canManage: boolean;
}

/** Operator classification feeding the statutory tourism reports (spec §4.9.2). */
export function TourismCategoryControl({
  reservationId,
  category,
  canManage,
}: TourismCategoryControlProps) {
  const t = useTranslations('backoffice.tourism');
  const tc = useTranslations('backoffice.common');
  const router = useRouter();
  const [value, setValue] = useState<TourismCategory>(category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('viewLabel', { category: category.replaceAll('_', ' ') })}
      </p>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/reservations/${reservationId}/tourism-category`, {
        method: 'PATCH',
        body: JSON.stringify({ tourismCategory: value }),
      });
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex items-end gap-2">
        <div className="w-56 space-y-1">
          <Label htmlFor="tourism-category">{t('classification')}</Label>
          <Select
            id="tourism-category"
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value as TourismCategory)}
          >
            {TOURISM_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || value === category}
          onClick={save}
        >
          {tc('save')}
        </Button>
      </div>
    </div>
  );
}
