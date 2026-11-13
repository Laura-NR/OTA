'use client';

import { cn, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useDisplayPreferences } from './display-provider';

/**
 * A catalogue photo. In low-bandwidth mode (DS 05) it is a "Load photo"
 * button in the photo's place until tapped, so the page downloads text
 * first; otherwise the image itself. `className` positions both.
 */
export function Photo({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const t = useTranslations('display');
  const { preferences } = useDisplayPreferences();
  const [requested, setRequested] = useState(false);

  if (preferences.lowBandwidth && !requested) {
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        aria-label={alt ? t('loadPhotoOf', { alt }) : undefined}
        className={cn(
          'flex items-center justify-center gap-2 bg-sunken text-body-sm font-semibold text-primary-700 underline-offset-[3px] hover:underline',
          className,
        )}
      >
        <Icon name="image" />
        {t('loadPhoto')}
      </button>
    );
  }
  return <img src={src} alt={alt} className={className} />;
}
