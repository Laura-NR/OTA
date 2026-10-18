'use client';

import { Alert, Button, Radio, RadioGroup } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useRouter } from '@/i18n/navigation';

/**
 * M8 D4: the traveler's answer to a disruption's options, once, before the
 * deadline. Each option states its money consequence; nothing is charged here,
 * the desk carries the choice out.
 */
export function DisruptionChoice({
  offerId,
  options,
  defaultKey,
}: {
  offerId: string;
  options: { key: string; title: string; detail: string }[];
  defaultKey: string | null;
}) {
  const t = useTranslations('disruptionOptions');
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(key: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ota/me/disruptions/${offerId}/choice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!response.ok) {
        throw new Error(t('failed'));
      }
      router.refresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('failed'));
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) void confirm(selected);
      }}
    >
      <RadioGroup legend={t('legend')} className="gap-2">
        {options.map((option) => (
          <Radio
            key={option.key}
            name={`disruption-${offerId}`}
            value={option.key}
            checked={selected === option.key}
            onChange={() => setSelected(option.key)}
            label={
              <span>
                <span className="font-mono font-semibold">{option.key}</span> ·{' '}
                {option.title}
                {option.key === defaultKey ? (
                  <span className="text-muted"> ({t('default')})</span>
                ) : null}
              </span>
            }
            description={option.detail}
            className="rounded-md border p-3"
          />
        ))}
      </RadioGroup>
      <div>
        <Button type="submit" size="lg" disabled={busy || selected === null}>
          {t('confirm', { key: selected ?? '' })}
        </Button>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </form>
  );
}
