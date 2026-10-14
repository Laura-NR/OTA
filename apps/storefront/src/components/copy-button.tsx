'use client';

import { Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Copies one value (an IBAN, a reference) and says so; a blocked clipboard says that instead. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations('checkout');
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="tertiary"
        size="sm"
        onClick={copy}
        aria-label={t('copyLabel', { label })}
      >
        {t('copy')}
      </Button>
      <span role="status" className="text-caption text-muted empty:hidden">
        {state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : ''}
      </span>
    </span>
  );
}
