'use client';

import { SUPPORTED_LOCALES } from '@ota/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { LOCALE_COOKIE } from '@/i18n/locale';

/** Pin the back-office language with a cookie, then re-render the server tree. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('backoffice.locale');
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={t('label')}
      value={locale}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
    >
      {SUPPORTED_LOCALES.map((code) => (
        <option key={code} value={code}>
          {code.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
