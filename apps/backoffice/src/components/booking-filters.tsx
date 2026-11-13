'use client';

import { TRAVEL_WINDOWS } from '@ota/domain';
import { Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useTransition } from 'react';

/**
 * A-Bookings' travel-date and province filters. Each change rewrites the URL,
 * which the server page reads, and goes back to the first page.
 */
export function BookingFilters({ provinces }: { provinces: readonly string[] }) {
  const t = useTranslations('backoffice.bookings.filters');
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
    next.delete('page');
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy={pending}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-window`}>{t('travelDate')}</Label>
        <Select
          id={`${id}-window`}
          value={params.get('window') ?? ''}
          onChange={(event) => update('window', event.target.value)}
        >
          <option value="">{t('anyDate')}</option>
          {TRAVEL_WINDOWS.map((window) => (
            <option key={window} value={window}>
              {t(`windows.${window}`)}
            </option>
          ))}
        </Select>
      </div>
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
    </div>
  );
}
