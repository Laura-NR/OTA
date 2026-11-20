'use client';

import { cn } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';

import { opsTime } from '@/lib/ops-format';

import { useDeskAlerts } from '../desk-alerts';

const PILL =
  'inline-flex h-touch items-center rounded-full px-3 text-caption font-semibold focus-visible:outline-accent-500';

/**
 * AL-Alerts' sound pill: "Sound on" mutes the desk's cue for 15 minutes,
 * "Muted · 14:47" lifts the mute; both are the desk's logged mute, so a mute
 * here silences the desk too. Until the page had a first tap the browser
 * holds the cue back, and the pill turns the sound on. Support sees the
 * state without the switch.
 */
export function LiteSound() {
  const t = useTranslations('backoffice.opsLite.sound');
  const locale = useLocale();
  const alerts = useDeskAlerts();
  if (!alerts) return null;
  const { mute, muteActive, muteBusy, canManage, soundReady } = alerts;

  if (muteActive && mute) {
    const until = opsTime(mute.until, locale);
    const label = t('mutedLabel', { time: until, name: mute.by ?? t('someone') });
    return canManage ? (
      <button
        type="button"
        aria-label={`${label} ${t('tapToUnmute')}`}
        disabled={muteBusy}
        onClick={() => void alerts.changeMute(false)}
        className={cn(PILL, 'bg-accent-500 text-neutral-900')}
      >
        {t('muted', { time: until })}
      </button>
    ) : (
      <span aria-label={label} className={cn(PILL, 'bg-accent-500 text-neutral-900')}>
        {t('muted', { time: until })}
      </span>
    );
  }
  if (!soundReady) {
    return (
      <button
        type="button"
        onClick={alerts.unlockSound}
        className={cn(PILL, 'bg-neutral-0/[.16] text-neutral-0')}
      >
        {t('turnOn')}
      </button>
    );
  }
  return canManage ? (
    <button
      type="button"
      aria-label={t('onLabel')}
      disabled={muteBusy}
      onClick={() => void alerts.changeMute(true)}
      className={cn(PILL, 'bg-neutral-0/[.16] text-neutral-0')}
    >
      {t('on')}
    </button>
  ) : (
    <span className={cn(PILL, 'bg-neutral-0/[.16] text-neutral-0')}>{t('on')}</span>
  );
}
