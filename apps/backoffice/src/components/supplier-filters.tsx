'use client';

import { VerificationStatus } from '@ota/domain';
import { Checkbox, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useTransition } from 'react';

/**
 * A-Suppliers' province, verification and "Backup power only" filters. Each
 * change rewrites the URL, which the server page reads.
 */
export function SupplierFilters({ provinces }: { provinces: readonly string[] }) {
  const t = useTranslations('backoffice.suppliers.filters');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const id = useId();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-province`}>{t('province')}</Label>
        <Select
          id={`${id}-province`}
          value={params.get('province') ?? ''}
          onChange={(event) => update('province', event.target.value)}
        >
          <option value="">{t('allProvinces')}</option>
          {provinces.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-status`}>{t('verification')}</Label>
        <Select
          id={`${id}-status`}
          value={params.get('status') ?? ''}
          onChange={(event) => update('status', event.target.value)}
        >
          <option value="">{t('any')}</option>
          {Object.values(VerificationStatus).map((status) => (
            <option key={status} value={status}>
              {status.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
      </div>
      <Checkbox
        label={t('backupPower')}
        checked={params.get('power') === '1'}
        onChange={(event) => update('power', event.target.checked ? '1' : '')}
        className="text-body-sm"
      />
    </div>
  );
}
