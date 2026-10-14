'use client';

import { Button, cn, Icon, Tabs, type TabItem } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MAX_COMPARE } from '@/lib/compare-limits';
import { useCompareSelection } from '@/lib/compare-selection';

/** The Package hero's Compare and Share (the board's Save waits for accounts' saved trips). */
export function PackageActions({ slug, name }: { slug: string; name: string }) {
  const t = useTranslations('packages.detail');
  const compare = useCompareSelection();
  const [shared, setShared] = useState<'copied' | 'failed' | null>(null);
  const on = compare.selected.includes(slug);
  const full = !on && compare.selected.length >= MAX_COMPARE;

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared('copied');
    } catch {
      setShared('failed');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        aria-pressed={on}
        disabled={full}
        onClick={() => compare.toggle(slug)}
        className={cn(on && 'border-primary-600 bg-primary-50')}
      >
        <Icon name="columns" />
        {on ? t('comparing') : t('compare')}
        <span className="sr-only"> {name}</span>
      </Button>
      <Button variant="secondary" onClick={share}>
        <Icon name="share" />
        {t('share')}
      </Button>
      <p role="status" className="text-body-sm text-secondary empty:hidden">
        {shared === 'copied' ? t('copied') : shared === 'failed' ? t('copyFailed') : ''}
      </p>
    </div>
  );
}

/** The Package tabs (DS 03); the panels are rendered on the server and passed in. */
export function PackageTabs({ items, label }: { items: TabItem[]; label: string }) {
  const [value, setValue] = useState(items[0]?.id ?? '');
  return <Tabs items={items} value={value} onValueChange={setValue} label={label} />;
}
