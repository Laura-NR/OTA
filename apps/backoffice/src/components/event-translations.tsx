'use client';

import type { EventDto, EventTranslationWriteRequest } from '@ota/schemas';
import { Alert, Badge, Button, Checkbox, Input, Label, Tabs, Textarea } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

interface Overlay {
  name: string;
  place: string;
  summary: string;
  notes: string;
  nights: Record<string, string>;
  categories: Record<string, string>;
  published: boolean;
}

function overlayFor(event: EventDto, locale: string): Overlay {
  const saved = event.translations.find((translation) => translation.locale === locale);
  return {
    name: saved?.name ?? '',
    place: saved?.place ?? '',
    summary: saved?.summary ?? '',
    notes: saved?.notes ?? '',
    nights: Object.fromEntries(
      event.nights.map((night) => [night.id, saved?.nights[night.id]?.label ?? '']),
    ),
    categories: Object.fromEntries(
      event.categories.map((category) => [
        category.id,
        saved?.categories[category.id]?.name ?? '',
      ]),
    ),
    published: saved?.published ?? false,
  };
}

/**
 * The event's text in the other site languages (M10 D1): one overlay per
 * locale, field by field, the source showing through where a field is empty.
 * A drafted overlay waits unpublished until a reviewer ticks it.
 */
export function EventTranslations({
  event,
  locales,
  canManage,
}: {
  event: EventDto;
  locales: readonly string[];
  canManage: boolean;
}) {
  const t = useTranslations('eventsDesk');
  const router = useRouter();
  const others = locales.filter((locale) => locale !== event.sourceLocale);
  const [tab, setTab] = useState(others[0] ?? '');
  const [overlays, setOverlays] = useState<Record<string, Overlay>>(() =>
    Object.fromEntries(others.map((locale) => [locale, overlayFor(event, locale)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (others.length === 0) {
    return <p className="text-body-sm text-muted">{t('translations.none')}</p>;
  }
  const current = overlays[tab]!;
  const update = (locale: string, patch: Partial<Overlay>) =>
    setOverlays((all) => ({ ...all, [locale]: { ...all[locale]!, ...patch } }));
  const orNull = (value: string) => value.trim() || null;

  async function onSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const body: EventTranslationWriteRequest = {
      name: orNull(current.name),
      place: orNull(current.place),
      summary: orNull(current.summary),
      notes: orNull(current.notes),
      nights: Object.fromEntries(
        Object.entries(current.nights).flatMap(([id, label]) =>
          label.trim() ? [[id, { label }]] : [],
        ),
      ),
      categories: Object.fromEntries(
        Object.entries(current.categories).flatMap(([id, name]) =>
          name.trim() ? [[id, { name }]] : [],
        ),
      ),
      published: current.published,
    };
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await apiRequest<EventDto>(`/events/${event.id}/translations/${tab}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setSaved(tab);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('translations.saveFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  function panel(locale: string) {
    const overlay = overlays[locale]!;
    const status = event.translations.find(
      (translation) => translation.locale === locale,
    );
    return (
      <fieldset disabled={!canManage} className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <Badge variant={status.published ? 'success' : 'outline'}>
              {status.published ? t('translations.published') : t('translations.draft')}
            </Badge>
          ) : (
            <Badge variant="outline">{t('translations.missing')}</Badge>
          )}
          {status?.stale ? (
            <Badge variant="warning">{t('translations.stale')}</Badge>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`overlay-name-${locale}`}>{t('editor.name')}</Label>
            <Input
              id={`overlay-name-${locale}`}
              placeholder={event.name}
              value={overlay.name}
              maxLength={120}
              onChange={(change) => update(locale, { name: change.target.value })}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`overlay-place-${locale}`}>{t('editor.place')}</Label>
            <Input
              id={`overlay-place-${locale}`}
              placeholder={event.place}
              value={overlay.place}
              maxLength={160}
              onChange={(change) => update(locale, { place: change.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`overlay-summary-${locale}`}>{t('editor.summary')}</Label>
          <Textarea
            id={`overlay-summary-${locale}`}
            rows={3}
            placeholder={event.summary}
            value={overlay.summary}
            maxLength={1200}
            onChange={(change) => update(locale, { summary: change.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`overlay-notes-${locale}`}>{t('editor.notes')}</Label>
          <Textarea
            id={`overlay-notes-${locale}`}
            rows={2}
            placeholder={event.notes ?? ''}
            value={overlay.notes}
            maxLength={2000}
            onChange={(change) => update(locale, { notes: change.target.value })}
          />
        </div>
        {event.nights.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {event.nights.map((night) => (
              <div key={night.id} className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`overlay-night-${locale}-${night.id}`}>
                  {t('translations.nightLabel', { label: night.label })}
                </Label>
                <Input
                  id={`overlay-night-${locale}-${night.id}`}
                  placeholder={night.label}
                  value={overlay.nights[night.id] ?? ''}
                  maxLength={120}
                  onChange={(change) =>
                    update(locale, {
                      nights: { ...overlay.nights, [night.id]: change.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
        {event.categories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {event.categories.map((category) => (
              <div key={category.id} className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`overlay-category-${locale}-${category.id}`}>
                  {t('translations.categoryName', { name: category.name })}
                </Label>
                <Input
                  id={`overlay-category-${locale}-${category.id}`}
                  placeholder={category.name}
                  value={overlay.categories[category.id] ?? ''}
                  maxLength={80}
                  onChange={(change) =>
                    update(locale, {
                      categories: {
                        ...overlay.categories,
                        [category.id]: change.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
        <Checkbox
          label={t('translations.publish')}
          description={t('translations.publishHint')}
          checked={overlay.published}
          onChange={(change) => update(locale, { published: change.target.checked })}
        />
      </fieldset>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={onSubmit}
      aria-label={t('translations.title')}
    >
      <Tabs
        label={t('translations.title')}
        value={tab}
        onValueChange={setTab}
        items={others.map((locale) => ({
          id: locale,
          label: locale.toUpperCase(),
          panel: panel(locale),
        }))}
      />
      {canManage ? (
        <Button type="submit" variant="secondary" className="self-start" disabled={busy}>
          {t('translations.save', { locale: tab.toUpperCase() })}
        </Button>
      ) : null}
      {saved ? (
        <p role="status" className="text-body-sm text-success-700">
          {t('translations.saved', { locale: saved.toUpperCase() })}
        </p>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </form>
  );
}
