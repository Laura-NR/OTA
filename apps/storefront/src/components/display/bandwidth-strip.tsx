'use client';

import { offersLowBandwidthMode, type ConnectionHint } from '@ota/domain';
import { Button, cn, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useDisplayPreferences } from './display-provider';

const wrap = 'mx-auto flex max-w-container items-center px-6 md:px-8 lg:px-10';
const textButton =
  'min-h-touch whitespace-nowrap px-2 font-semibold underline underline-offset-[3px] focus-visible:outline-accent-500';

/** The browser's connection estimate (Network Information API), where it has one. */
function connectionHint(): ConnectionHint | null {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; downlink?: number; effectiveType?: string };
    }
  ).connection;
  return connection
    ? {
        saveData: connection.saveData,
        downlinkMbps: connection.downlink,
        effectiveType: connection.effectiveType,
      }
    : null;
}

/**
 * Low-bandwidth mode above the header (DS 05): while it is on, the strip says
 * so and turns it off; while it is off, a slow connection (under 200 kbps)
 * offers it once. The offer needs the browser, so it never renders on the
 * server.
 */
export function BandwidthStrip() {
  const t = useTranslations('display');
  const { preferences, update } = useDisplayPreferences();
  const [slow, setSlow] = useState<ConnectionHint | null>(null);

  useEffect(() => {
    setSlow(connectionHint());
  }, []);

  const offer = offersLowBandwidthMode(preferences, slow);
  if (!preferences.lowBandwidth && !offer) {
    return null;
  }

  return (
    <div
      role={offer ? 'region' : 'status'}
      aria-label={offer ? t('lowBandwidth') : undefined}
      className="bg-neutral-900 text-neutral-0"
    >
      <div className={cn(wrap, 'flex-wrap gap-x-4 gap-y-2 py-2 text-body-sm')}>
        <Icon name="info" className="shrink-0" />
        <p className="min-w-0 flex-1">{offer ? t('prompt') : t('textOnly')}</p>
        {offer ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="border-transparent text-neutral-900"
              onClick={() => update({ lowBandwidth: true })}
            >
              {t('turnOn')}
            </Button>
            <button
              type="button"
              onClick={() => update({ bandwidthPromptDismissed: true })}
              className={textButton}
            >
              {t('notNow')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => update({ lowBandwidth: false })}
            className={textButton}
          >
            {t('turnOff')}
          </button>
        )}
      </div>
    </div>
  );
}
