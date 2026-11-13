'use client';

import type { ConsentPurposeDto, MyConsentDto } from '@ota/schemas';
import { Alert, Switch } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

/** The consents Account › Preferences offers (Account board "Notifications"). */
const OFFERED: readonly ConsentPurposeDto[] = ['TRIP_MESSAGES', 'MARKETING_EMAIL'];

/**
 * Notification consents (M3, D4): each switch records a grant or withdrawal
 * against the version of the words shown under it, so the log proves what
 * the traveler agreed to. Booking updates are not a consent and are not here.
 */
export function NotificationPreferences({ consents }: { consents: MyConsentDto[] }) {
  const t = useTranslations('account.preferences');
  const locale = useLocale();
  const offered = consents.filter(
    (consent) => OFFERED.includes(consent.purpose) && consent.text !== null,
  );
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      offered.map((consent) => [
        consent.purpose,
        !consent.needsConsent && consent.current?.granted === true,
      ]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (offered.length === 0) {
    return <p className="text-body-sm text-muted">{t('none')}</p>;
  }

  async function choose(consent: MyConsentDto, granted: boolean) {
    setBusy(consent.purpose);
    setSaved(null);
    setError(null);
    try {
      const response = await fetch('/api/ota/me/consents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          purpose: consent.purpose,
          granted,
          textVersion: consent.text!.version,
          source: 'ACCOUNT',
          locale,
        }),
      });
      if (!response.ok) {
        throw new Error(t('failed'));
      }
      setState((current) => ({ ...current, [consent.purpose]: granted }));
      setSaved(consent.purpose);
    } catch {
      setError(t('failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-secondary">{t('lede')}</p>
      <ul className="flex flex-col divide-y rounded-lg border bg-surface">
        {offered.map((consent) => {
          const labelId = `consent-${consent.purpose}`;
          const on = state[consent.purpose] ?? false;
          return (
            <li key={consent.purpose} className="flex items-start gap-4 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span id={labelId} className="text-body font-semibold text-default">
                  {t(`purposes.${consent.purpose}`)}
                </span>
                <span className="text-body-sm text-secondary">{consent.text!.text}</span>
                <span className="text-caption text-muted" aria-live="polite">
                  {busy === consent.purpose
                    ? t('saving')
                    : saved === consent.purpose
                      ? t('saved')
                      : on
                        ? t('on')
                        : t('off')}
                </span>
              </div>
              <Switch
                aria-labelledby={labelId}
                checked={on}
                disabled={busy !== null}
                onCheckedChange={(checked) => choose(consent, checked)}
              />
            </li>
          );
        })}
      </ul>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
