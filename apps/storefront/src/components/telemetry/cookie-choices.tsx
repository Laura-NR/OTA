'use client';

import { Button, cn, Switch } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { WRAPPING_BUTTON } from '@/lib/button';

import { useTelemetry, type ConsentSource } from './telemetry-provider';

/**
 * The cookie rows and actions (DS 04 consent, Legal › Cookie settings):
 * Essential is always on; each optional purpose the agency has words for is a
 * switch, off unless already granted (no pre-ticked boxes). "Reject
 * non-essential" and "Accept all" are equally weighted; "Save my selection"
 * keeps the switches as set.
 */
export function CookieChoices({
  source,
  onSaved,
  stickyActions = false,
}: {
  source: ConsentSource;
  onSaved?: () => void;
  /** Keep the actions in view at the foot of a scrolling container (the banner). */
  stickyActions?: boolean;
}) {
  const t = useTranslations('cookies');
  const { texts, permissions, save } = useTelemetry();
  const [selection, setSelection] = useState(permissions);
  // The banner and the settings page can both be in the DOM; ids are per instance.
  const idBase = useId();

  const offered = (['analytics', 'marketing'] as const).filter(
    (purpose) => texts[purpose],
  );

  function choose(next: typeof selection) {
    setSelection(next);
    save(next, source);
    onSaved?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y rounded-lg border bg-surface">
        <li className="flex items-start gap-4 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-body font-semibold text-default">{t('essential')}</span>
            <span className="text-body-sm text-secondary">{t('essentialText')}</span>
          </div>
          <span className="shrink-0 text-body-sm font-semibold text-secondary">
            {t('alwaysOn')}
          </span>
        </li>
        {offered.map((purpose) => {
          const labelId = `${idBase}-${purpose}`;
          const textId = `${labelId}-text`;
          return (
            <li key={purpose} className="flex items-start gap-4 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span id={labelId} className="text-body font-semibold text-default">
                  {t(purpose)}
                </span>
                <span id={textId} className="text-body-sm text-secondary">
                  {texts[purpose]!.text}
                </span>
              </div>
              <Switch
                aria-labelledby={labelId}
                aria-describedby={textId}
                checked={selection[purpose]}
                onCheckedChange={(checked) =>
                  setSelection((current) => ({ ...current, [purpose]: checked }))
                }
              />
            </li>
          );
        })}
      </ul>
      <div
        className={cn(
          'flex flex-wrap gap-3',
          stickyActions && 'sticky bottom-0 -mb-5 border-t bg-surface pb-5 pt-3',
        )}
      >
        <Button
          type="button"
          variant="secondary"
          className={cn(WRAPPING_BUTTON, 'flex-1 basis-40')}
          onClick={() => choose({ analytics: false, marketing: false })}
        >
          {t('rejectAll')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={cn(WRAPPING_BUTTON, 'flex-1 basis-40')}
          onClick={() => choose({ analytics: true, marketing: true })}
        >
          {t('acceptAll')}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          className={cn(WRAPPING_BUTTON, 'basis-full')}
          onClick={() => choose(selection)}
        >
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
