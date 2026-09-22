'use client';

import type { InventoryItemDto } from '@ota/schemas';
import { Alert, Badge, Button, Card, CardContent, Input, Label } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { useRouter } from '@/i18n/navigation';

const STEP_KEYS = ['dates', 'stays', 'transport', 'experiences', 'review'] as const;

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
            <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent">
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
              <span className="text-muted-foreground">
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
 * Five-step dynamic package builder (spec §4.2): dates, then stays, transport,
 * and experiences from the published catalog, then review. Submitting creates
 * an ITINERARY_SUBMITTED booking for the signed-in traveler.
 */
export function PackageBuilder({ items }: { items: InventoryItemDto[] }) {
  const t = useTranslations('build');
  const tc = useTranslations('catalog');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const response = await fetch('/api/ota/me/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          serviceItems: selected.map((inventoryItemId) => ({ inventoryItemId })),
        }),
      });
      if (!response.ok) {
        throw new Error(t('error'));
      }
      const reservation = (await response.json()) as { id: string };
      router.push(`/account/reservations/${reservation.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <ol className="flex flex-wrap gap-2 text-xs">
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
            {selectedItems.length === 0 ? (
              <Alert>{t('addAtLeastOne')}</Alert>
            ) : (
              <ul className="space-y-2 text-sm">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.name}{' '}
                      <span className="text-muted-foreground">
                        ({tc(`types.${item.type}`)})
                      </span>
                    </span>
                    <span>
                      {item.currency} {Number(item.basePrice).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium">
              {t('estimatedTotal', { currency: 'EUR', amount: total.toFixed(2) })}
            </p>
          </div>
        ) : null}

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
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
            <Button disabled={selected.length === 0 || busy} onClick={submit}>
              {busy ? t('submitting') : t('submit')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
