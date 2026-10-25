'use client';

import type { DisplayPreferences } from '@ota/domain';
import { cn, Switch } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { useDisplayPreferences } from './display-provider';

const OPTIONS = [
  { key: 'largeText', label: 'largeText', help: 'largeTextHelp' },
  { key: 'reduceMotion', label: 'reduceMotion', help: 'reduceMotionHelp' },
  { key: 'lowBandwidth', label: 'lowBandwidth', help: 'lowBandwidthHelp' },
  { key: 'highContrast', label: 'highContrast', help: 'highContrastHelp' },
] as const satisfies ReadonlyArray<{
  key: keyof DisplayPreferences;
  label: string;
  help: string;
}>;

/**
 * Larger text, reduce motion, low-bandwidth mode and high contrast (Account
 * board, "Accessibility & data"), kept on this device. Account › Preferences shows them in a card; the menu
 * drawer shows them `compact`, so signed-out visitors can choose too.
 */
export function DisplayPreferencesForm({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('display');
  const { preferences, update } = useDisplayPreferences();

  return (
    <ul
      className={cn(
        'flex flex-col divide-y',
        compact ? null : 'rounded-lg border bg-surface',
      )}
    >
      {OPTIONS.map((option) => {
        const labelId = `display-${option.key}${compact ? '-menu' : ''}`;
        const on = preferences[option.key];
        return (
          <li
            key={option.key}
            className={cn('flex items-start gap-4', compact ? 'py-3' : 'p-4')}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span id={labelId} className="text-body font-semibold text-default">
                {t(option.label)}
              </span>
              <span className="text-body-sm text-secondary">{t(option.help)}</span>
              {compact ? null : (
                <span className="text-caption text-muted">{on ? t('on') : t('off')}</span>
              )}
            </div>
            <Switch
              aria-labelledby={labelId}
              checked={on}
              onCheckedChange={(checked) => update({ [option.key]: checked })}
            />
          </li>
        );
      })}
    </ul>
  );
}
