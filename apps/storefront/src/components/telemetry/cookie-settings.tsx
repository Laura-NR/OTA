'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CookieChoices } from './cookie-choices';

/**
 * Legal › Cookie settings: the same choices as the banner, changeable at any
 * time. A save refreshes the page so the "saved on" line reads the new cookie.
 */
export function CookieSettings() {
  const t = useTranslations('cookies');
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <CookieChoices
        source="settings"
        onSaved={() => {
          setSaved(true);
          router.refresh();
        }}
      />
      <p role="status" className="text-body-sm text-success-700">
        {saved ? t('saved') : null}
      </p>
    </div>
  );
}
