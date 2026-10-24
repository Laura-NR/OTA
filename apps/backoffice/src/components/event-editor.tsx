'use client';

import { EVENT_ACCESS, SEAT_CATEGORY_KINDS } from '@ota/domain';
import type { EventAccess, SeatCategoryKind } from '@ota/domain';
import type { EventDto, EventWriteRequest } from '@ota/schemas';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Select,
  Textarea,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

interface NightRow {
  key: string;
  id?: string;
  date: string;
  label: string;
  venue: string;
}

interface CategoryRow {
  key: string;
  id?: string;
  kind: SeatCategoryKind;
  name: string;
  description: string;
  price: string;
}

/**
 * A-Content's event editor (M10 D1, D2): the event's details, its nights and
 * its seat categories in the source language. Nights and categories keep their
 * ids across saves, because requests point at them; the API refuses removing
 * one a request holds.
 */
export function EventEditor({
  event,
  locales,
  defaultSourceLocale,
  provinces,
}: {
  event: EventDto | null;
  locales: readonly string[];
  defaultSourceLocale: string;
  provinces: readonly { code: string; name: string }[];
}) {
  const t = useTranslations('eventsDesk');
  const router = useRouter();
  const counter = useRef(0);
  const nextKey = () => {
    counter.current += 1;
    return `new-${counter.current}`;
  };

  const [name, setName] = useState(event?.name ?? '');
  const [place, setPlace] = useState(event?.place ?? '');
  const [summary, setSummary] = useState(event?.summary ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [sourceLocale, setSourceLocale] = useState(
    event?.sourceLocale ?? defaultSourceLocale,
  );
  const [province, setProvince] = useState(event?.province ?? 'CU03');
  const [access, setAccess] = useState<EventAccess>(event?.access ?? 'REQUEST_ONLY');
  const [startsOn, setStartsOn] = useState(event?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(event?.endsOn ?? '');
  const [datesConfirmed, setDatesConfirmed] = useState(event?.datesConfirmed ?? false);
  const [confirmBy, setConfirmBy] = useState(event?.confirmBy ?? '');
  const [nights, setNights] = useState<NightRow[]>(
    () =>
      event?.nights.map((night) => ({
        key: night.id,
        id: night.id,
        date: night.date,
        label: night.label,
        venue: night.venue ?? '',
      })) ?? [],
  );
  const [categories, setCategories] = useState<CategoryRow[]>(
    () =>
      event?.categories.map((category) => ({
        key: category.id,
        id: category.id,
        kind: category.kind,
        name: category.name,
        description: category.description ?? '',
        price: category.pricePerSeat === null ? '' : String(category.pricePerSeat),
      })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setNight = (key: string, field: 'date' | 'label' | 'venue', value: string) =>
    setNights((rows) =>
      rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  const setCategory = (
    key: string,
    field: 'kind' | 'name' | 'description' | 'price',
    value: string,
  ) =>
    setCategories((rows) =>
      rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );

  async function onSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const body = {
      access,
      province,
      startsOn,
      endsOn,
      datesConfirmed,
      confirmBy: confirmBy || null,
      sourceLocale,
      name,
      place,
      summary,
      notes: notes.trim() || null,
      nights: nights.map((night) => ({
        ...(night.id ? { id: night.id } : {}),
        date: night.date,
        label: night.label,
        venue: night.venue.trim() || null,
      })),
      categories: categories.map((category) => ({
        ...(category.id ? { id: category.id } : {}),
        kind: category.kind,
        name: category.name,
        description: category.description.trim() || null,
        pricePerSeat: category.price.trim() === '' ? null : Number(category.price),
      })),
    } as unknown as EventWriteRequest;
    setBusy(true);
    setError(null);
    try {
      const saved = await apiRequest<EventDto>(
        event ? `/events/${event.id}` : '/events',
        {
          method: event ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
      if (event) {
        router.refresh();
      } else {
        router.push(`/content/events/${saved.id}`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('editor.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={onSubmit}
      aria-label={t('editor.title')}
    >
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('editor.details')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-name">{t('editor.name')}</Label>
              <Input
                id="event-name"
                required
                maxLength={120}
                value={name}
                onChange={(change) => setName(change.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-place">{t('editor.place')}</Label>
              <Input
                id="event-place"
                required
                maxLength={160}
                value={place}
                onChange={(change) => setPlace(change.target.value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="event-province">{t('editor.province')}</Label>
                <Select
                  id="event-province"
                  value={province}
                  onChange={(change) => setProvince(change.target.value)}
                >
                  {provinces.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="event-access">{t('editor.access')}</Label>
                <Select
                  id="event-access"
                  value={access}
                  onChange={(change) => setAccess(change.target.value as EventAccess)}
                >
                  {EVENT_ACCESS.map((value) => (
                    <option key={value} value={value}>
                      {t(`access.${value}`)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-caption text-muted">{t(`accessHints.${access}`)}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-summary">{t('editor.summary')}</Label>
              <Textarea
                id="event-summary"
                required
                rows={4}
                maxLength={1200}
                value={summary}
                onChange={(change) => setSummary(change.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-notes">{t('editor.notes')}</Label>
              <Textarea
                id="event-notes"
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(change) => setNotes(change.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-source-locale">{t('editor.sourceLocale')}</Label>
              <Select
                id="event-source-locale"
                value={sourceLocale}
                onChange={(change) => setSourceLocale(change.target.value)}
              >
                {locales.map((locale) => (
                  <option key={locale} value={locale}>
                    {locale.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('editor.dates')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="event-starts">{t('editor.startsOn')}</Label>
                <Input
                  id="event-starts"
                  type="date"
                  required
                  value={startsOn}
                  onChange={(change) => setStartsOn(change.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="event-ends">{t('editor.endsOn')}</Label>
                <Input
                  id="event-ends"
                  type="date"
                  required
                  value={endsOn}
                  onChange={(change) => setEndsOn(change.target.value)}
                />
              </div>
            </div>
            <Checkbox
              label={t('editor.datesConfirmed')}
              description={t('editor.datesConfirmedHint')}
              checked={datesConfirmed}
              onChange={(change) => setDatesConfirmed(change.target.checked)}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-confirm-by">{t('editor.confirmBy')}</Label>
              <Input
                id="event-confirm-by"
                type="date"
                aria-describedby="event-confirm-by-hint"
                value={confirmBy}
                onChange={(change) => setConfirmBy(change.target.value)}
              />
              <p id="event-confirm-by-hint" className="text-caption text-muted">
                {t('editor.confirmByHint')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('editor.nights')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {nights.length === 0 ? (
            <p className="text-body-sm text-muted">{t('editor.noNights')}</p>
          ) : null}
          {nights.map((night, index) => (
            <fieldset
              key={night.key}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end"
            >
              <legend className="sr-only">
                {t('editor.night', { number: index + 1 })}
              </legend>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`night-date-${night.key}`}>{t('editor.nightDate')}</Label>
                <Input
                  id={`night-date-${night.key}`}
                  type="date"
                  required
                  value={night.date}
                  onChange={(change) => setNight(night.key, 'date', change.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`night-label-${night.key}`}>
                  {t('editor.nightLabel')}
                </Label>
                <Input
                  id={`night-label-${night.key}`}
                  required
                  maxLength={120}
                  value={night.label}
                  onChange={(change) => setNight(night.key, 'label', change.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`night-venue-${night.key}`}>
                  {t('editor.nightVenue')}
                </Label>
                <Input
                  id={`night-venue-${night.key}`}
                  maxLength={160}
                  value={night.venue}
                  onChange={(change) => setNight(night.key, 'venue', change.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={() =>
                  setNights((rows) => rows.filter((row) => row.key !== night.key))
                }
              >
                {t('editor.remove')}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() =>
              setNights((rows) => [
                ...rows,
                {
                  key: nextKey(),
                  date: rows.at(-1)?.date ?? startsOn,
                  label: '',
                  venue: '',
                },
              ])
            }
          >
            {t('editor.addNight')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('editor.categories')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {categories.length === 0 ? (
            <p className="text-body-sm text-muted">{t('editor.noCategories')}</p>
          ) : null}
          {categories.map((category, index) => (
            <fieldset
              key={category.key}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-[13rem_1fr_8rem_auto] sm:items-end"
            >
              <legend className="sr-only">
                {t('editor.category', { number: index + 1 })}
              </legend>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`category-kind-${category.key}`}>
                  {t('editor.categoryKind')}
                </Label>
                <Select
                  id={`category-kind-${category.key}`}
                  value={category.kind}
                  onChange={(change) =>
                    setCategory(category.key, 'kind', change.target.value)
                  }
                >
                  {SEAT_CATEGORY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`kinds.${kind}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`category-name-${category.key}`}>
                  {t('editor.categoryName')}
                </Label>
                <Input
                  id={`category-name-${category.key}`}
                  required
                  maxLength={80}
                  value={category.name}
                  onChange={(change) =>
                    setCategory(category.key, 'name', change.target.value)
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`category-price-${category.key}`}>
                  {t('editor.categoryPrice')}
                </Label>
                <Input
                  id={`category-price-${category.key}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={category.price}
                  onChange={(change) =>
                    setCategory(category.key, 'price', change.target.value)
                  }
                />
              </div>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={() =>
                  setCategories((rows) => rows.filter((row) => row.key !== category.key))
                }
              >
                {t('editor.remove')}
              </Button>
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-4">
                <Label htmlFor={`category-description-${category.key}`}>
                  {t('editor.categoryDescription')}
                </Label>
                <Input
                  id={`category-description-${category.key}`}
                  maxLength={240}
                  value={category.description}
                  onChange={(change) =>
                    setCategory(category.key, 'description', change.target.value)
                  }
                />
              </div>
            </fieldset>
          ))}
          <p className="text-caption text-muted">{t('editor.priceHint')}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() =>
              setCategories((rows) => [
                ...rows,
                { key: nextKey(), kind: 'GENERAL', name: '', description: '', price: '' },
              ])
            }
          >
            {t('editor.addCategory')}
          </Button>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {event ? t('editor.save') : t('editor.create')}
        </Button>
      </div>
    </form>
  );
}
