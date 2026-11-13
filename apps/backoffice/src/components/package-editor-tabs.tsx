'use client';

import { Tabs } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A-Package-Edit's sections as tabs: the details form, the photos and the
 * per-locale translations. Every panel stays mounted (hidden, not removed), so
 * unsaved edits survive a switch between tabs.
 */
export function PackageEditorTabs({
  details,
  photos,
  translations,
}: {
  details: ReactNode;
  photos: ReactNode;
  translations: ReactNode;
}) {
  const t = useTranslations('backoffice.packageDetail.tabs');
  const [tab, setTab] = useState('details');

  return (
    <Tabs
      label={t('label')}
      value={tab}
      onValueChange={setTab}
      items={[
        { id: 'details', label: t('details'), panel: details },
        { id: 'photos', label: t('photos'), panel: photos },
        { id: 'translations', label: t('translations'), panel: translations },
      ]}
    />
  );
}
