'use client';

import type { InventoryItemDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Textarea,
  buttonClassName,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Link } from '@/i18n/navigation';

const STEP_KEYS = ['dates', 'stays', 'transport', 'experiences', 'review'] as const;

interface SentRequest {
  id: string;
  requestId: string;
  reference: string;
}

function ItemPicker({
  items,
  selected,
  onToggle,
}: {
  items: InventoryItemDto[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations('build');
  const tc = useTranslations('catalog');

  if (items.length === 0) {
    return <Alert>{t('noOptions')}</Alert>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const checked = selected.includes(item.id);
        return (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-body-sm hover:bg-neutral-100">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.id)}
              />
              {item.media[0] ? (
                <img
                  src={`/api/ota/catalog/media/${item.media[0].id}`}
                  alt={item.media[0].altText ?? item.name}
                  className="h-10 w-16 rounded object-cover"
                />
              ) : null}
              <span className="flex-1 font-medium">{item.name}</span>
              <span className="text-muted">
                {item.province ?? tc('provinceFallback')}
              </span>
              <span>
                {item.currency} {Number(item.basePrice).toFixed(2)}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Five-step custom-trip builder (Custom / M-Custom boards; M5): dates and
 * party, then stays, transport, experiences and a review with the traveler's
 * notes. Submitting creates a CustomRequest — not a booking — so the desk can
 * price a proposal the traveler accepts.
 */
export function PackageBuilder({ items }: { items: InventoryItemDto[] }) {
  const t = useTranslations('build');
  const tc = useTranslations('catalog');
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentRequest | null>(null);

  const byType = useMemo(
    () => ({
      ACCOMMODATION: items.filter((item) => item.type === 'ACCOMMODATION'),
      TRANSPORT: items.filter((item) => item.type === 'TRANSPORT'),
      EXPERIENCE: items.filter((item) => item.type === 'EXPERIENCE'),
    }),
    [items],
  );

  const selectedItems = items.filter((item) => selected.includes(item.id));
  const total = selectedItems.reduce((sum, item) => sum + Number(item.basePrice), 0);
  const datesValid =
    Boolean(startDate && endDate) && new Date(endDate) >= new Date(startDate);
  const hasSomething = selected.length > 0 || notes.trim().length > 0;

  function toggle(id: string) {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/ota/me/custom-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          adults,
          children,
          inventoryItemIds: selected,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          locale,
        }),
      });
      if (!response.ok) {
        throw new Error(t('error'));
      }
      const request = (await response.json()) as SentRequest;
      setSent(request);
      window.scrollTo({ top: 0 });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Badge variant="success">{t('requestedTitle')}</Badge>
          <h2 className="text-h3 font-display">{t('requestedTitle')}</h2>
          <p className="text-body text-secondary">{t('requestedLede')}</p>
          <p className="text-body-sm">
            {t('reference')}:{' '}
            <span className="font-mono font-semibold">{sent.reference}</span>
          </p>
          <p className="text-body-sm text-muted">{t('requestedNote')}</p>
          <Link
            href={`/account/proposals/${sent.id}`}
            className={buttonClassName({ size: 'lg' })}
          >
            {t('openProposal')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <ol className="flex flex-wrap gap-2 text-caption">
          {STEP_KEYS.map((key, index) => (
            <li key={key}>
              <Badge variant={index === step ? 'default' : 'outline'}>
                {index + 1}. {t(`steps.${key}`)}
              </Badge>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="build-start">{t('startDate')}</Label>
              <Input
                id="build-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="build-end">{t('endDate')}</Label>
              <Input
                id="build-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="build-adults">{t('adults')}</Label>
              <Input
                id="build-adults"
                type="number"
                min={1}
                max={20}
                value={adults}
                onChange={(event) =>
                  setAdults(Math.max(1, Number(event.target.value) || 1))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="build-children">{t('children')}</Label>
              <Input
                id="build-children"
                type="number"
                min={0}
                max={20}
                value={children}
                onChange={(event) =>
                  setChildren(Math.max(0, Number(event.target.value) || 0))
                }
              />
            </div>
            {startDate && endDate && !datesValid ? (
              <Alert variant="destructive">{t('dateError')}</Alert>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <ItemPicker
            items={byType.ACCOMMODATION}
            selected={selected}
            onToggle={toggle}
          />
        ) : null}
        {step === 2 ? (
          <ItemPicker items={byType.TRANSPORT} selected={selected} onToggle={toggle} />
        ) : null}
        {step === 3 ? (
          <ItemPicker items={byType.EXPERIENCE} selected={selected} onToggle={toggle} />
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            {selectedItems.length === 0 && !notes.trim() ? (
              <Alert>{t('addAtLeastOne')}</Alert>
            ) : (
              <ul className="space-y-2 text-body-sm">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.name}{' '}
                      <span className="text-muted">({tc(`types.${item.type}`)})</span>
                    </span>
                    <span>
                      {item.currency} {Number(item.basePrice).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {selectedItems.length > 0 ? (
              <p className="text-body-sm font-medium">
                {t('estimatedTotal', { currency: 'EUR', amount: total.toFixed(2) })}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="build-notes">{t('notesLabel')}</Label>
              <Textarea
                id="build-notes"
                rows={4}
                value={notes}
                placeholder={t('notesPlaceholder')}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="flex justify-between gap-2">
          <Button
            variant="secondary"
            disabled={step === 0 || busy}
            onClick={() => setStep((value) => Math.max(value - 1, 0))}
          >
            {t('back')}
          </Button>
          {step < STEP_KEYS.length - 1 ? (
            <Button
              disabled={(step === 0 && !datesValid) || busy}
              onClick={() => setStep((value) => value + 1)}
            >
              {t('continue')}
            </Button>
          ) : (
            <Button disabled={!hasSomething || busy} onClick={submit}>
              {busy ? t('submitting') : t('submit')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
