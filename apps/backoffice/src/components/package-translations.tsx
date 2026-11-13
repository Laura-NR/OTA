'use client';

import type { PackageDto, PackageTranslationDto } from '@ota/schemas';
import { Alert, Badge, Button, Checkbox, Input, Label, Select, Textarea } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { apiRequest } from '@/lib/client-api';

type TranslationState = 'missing' | 'draft' | 'outdated' | 'inSync';

const STATE_VARIANT: Record<TranslationState, BadgeVariant> = {
  missing: 'outline',
  draft: 'secondary',
  outdated: 'warning',
  inSync: 'success',
};

/** Where a locale stands: not translated, saved before the source changed, unpublished, or current. */
function translationState(
  translation: PackageTranslationDto | undefined,
  contentUpdatedAt: string,
): TranslationState {
  if (!translation) return 'missing';
  if (new Date(translation.sourceUpdatedAt) < new Date(contentUpdatedAt))
    return 'outdated';
  return translation.published ? 'inSync' : 'draft';
}

type Overlay = Record<string, Record<string, string>>;

function overlayOf(value: unknown): Overlay {
  return value && typeof value === 'object' ? (value as Overlay) : {};
}

/** Keep only the fields someone filled in; a blank one falls back to the source. */
function compact(entries: Record<string, Record<string, string>>): Overlay {
  const result: Overlay = {};
  for (const [key, fields] of Object.entries(entries)) {
    const filled = Object.fromEntries(
      Object.entries(fields)
        .map(([field, value]) => [field, value.trim()] as const)
        .filter(([, value]) => value !== ''),
    );
    if (Object.keys(filled).length > 0) result[key] = filled;
  }
  return result;
}

const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

/**
 * A-Package-Edit's translations (M1 decision D1): one overlay per locale over
 * the source text, saved with PUT /packages/:id/translations/:locale. The
 * source text shows as each field's placeholder; a blank field falls back to
 * it, and only a published translation reaches the storefront.
 */
export function PackageTranslations({
  pkg,
  locales,
}: {
  pkg: PackageDto;
  locales: string[];
}) {
  const t = useTranslations('backoffice.packageTranslations');
  const targets = locales.filter((locale) => locale !== pkg.sourceLocale);
  const [locale, setLocale] = useState(targets[0] ?? '');

  if (targets.length === 0) {
    return <p className="text-body-sm text-muted">{t('onlySource')}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-sm text-secondary">{t('intro')}</p>
      <ul aria-label={t('statusLabel')} className="flex flex-wrap gap-2">
        <li>
          <Badge variant="default">
            {pkg.sourceLocale.toUpperCase()} · {t('source')}
          </Badge>
        </li>
        {targets.map((target) => {
          const state = translationState(
            pkg.translations.find((row) => row.locale === target),
            pkg.contentUpdatedAt,
          );
          return (
            <li key={target}>
              <Badge variant={STATE_VARIANT[state]}>
                {target.toUpperCase()} · {t(`states.${state}`)}
              </Badge>
            </li>
          );
        })}
      </ul>

      <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="translation-locale">{t('locale')}</Label>
        <Select
          id="translation-locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        >
          {targets.map((target) => (
            <option key={target} value={target}>
              {target.toUpperCase()}
            </option>
          ))}
        </Select>
      </div>

      <TranslationForm
        key={locale}
        pkg={pkg}
        locale={locale}
        translation={pkg.translations.find((row) => row.locale === locale)}
      />
    </div>
  );
}

function Labelled({
  id,
  label,
  children,
}: {
  id: string;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function TranslationForm({
  pkg,
  locale,
  translation,
}: {
  pkg: PackageDto;
  locale: string;
  translation: PackageTranslationDto | undefined;
}) {
  const t = useTranslations('backoffice.packageTranslations');
  const media = useTranslations('backoffice.packageMedia');
  const router = useRouter();
  const days = overlayOf(translation?.days);
  const tiers = overlayOf(translation?.tiers);
  const extras = overlayOf(translation?.extras);
  const mediaAlt = (translation?.mediaAlt ?? {}) as Record<string, string>;

  const [words, setWords] = useState({
    name: translation?.name ?? '',
    summary: translation?.summary ?? '',
    description: translation?.description ?? '',
    included: (translation?.included ?? []).join('\n'),
    excluded: (translation?.excluded ?? []).join('\n'),
    cubaNotes: translation?.cubaNotes ?? '',
    seoTitle: translation?.seoTitle ?? '',
    seoDescription: translation?.seoDescription ?? '',
  });
  const [dayRows, setDayRows] = useState(() =>
    Object.fromEntries(
      pkg.days.map((day) => {
        const key = String(day.dayOffset);
        return [
          key,
          {
            title: days[key]?.title ?? '',
            body: days[key]?.body ?? '',
            meals: days[key]?.meals ?? '',
          },
        ];
      }),
    ),
  );
  const [tierRows, setTierRows] = useState(() =>
    Object.fromEntries(
      pkg.tiers.map((tier) => [
        tier.code,
        {
          name: tiers[tier.code]?.name ?? '',
          description: tiers[tier.code]?.description ?? '',
        },
      ]),
    ),
  );
  const [extraRows, setExtraRows] = useState(() =>
    Object.fromEntries(
      pkg.extras.map((extra) => [
        extra.code,
        {
          name: extras[extra.code]?.name ?? '',
          description: extras[extra.code]?.description ?? '',
          durationLabel: extras[extra.code]?.durationLabel ?? '',
        },
      ]),
    ),
  );
  const [altRows, setAltRows] = useState(() =>
    Object.fromEntries(pkg.media.map((photo) => [photo.id, mediaAlt[photo.id] ?? ''])),
  );
  const [published, setPublished] = useState(translation?.published ?? false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outdated = translationState(translation, pkg.contentUpdatedAt) === 'outdated';

  const word = (field: keyof typeof words) => ({
    value: words[field],
    onChange: (event: { target: { value: string } }) =>
      setWords((current) => ({ ...current, [field]: event.target.value })),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await apiRequest(`/packages/${pkg.id}/translations/${locale}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: orNull(words.name),
          summary: orNull(words.summary),
          description: orNull(words.description),
          included: lines(words.included),
          excluded: lines(words.excluded),
          cubaNotes: orNull(words.cubaNotes),
          seoTitle: orNull(words.seoTitle),
          seoDescription: orNull(words.seoDescription),
          days: compact(dayRows),
          tiers: compact(tierRows),
          extras: compact(extraRows),
          mediaAlt: Object.fromEntries(
            Object.entries(altRows)
              .map(([id, alt]) => [id, alt.trim()] as const)
              .filter(([, alt]) => alt !== ''),
          ),
          published,
        }),
      });
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const id = (field: string) => `translation-${locale}-${field}`;

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      {outdated ? <Alert variant="warning">{t('outdatedNote')}</Alert> : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-body-sm font-semibold">{t('words')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled id={id('name')} label={t('name')}>
            <Input
              id={id('name')}
              maxLength={200}
              placeholder={pkg.name}
              {...word('name')}
            />
          </Labelled>
          <Labelled id={id('seoTitle')} label={t('seoTitle')}>
            <Input
              id={id('seoTitle')}
              maxLength={200}
              placeholder={pkg.seoTitle ?? ''}
              {...word('seoTitle')}
            />
          </Labelled>
        </div>
        <Labelled id={id('summary')} label={t('summary')}>
          <Textarea
            id={id('summary')}
            rows={2}
            maxLength={400}
            placeholder={pkg.summary ?? ''}
            {...word('summary')}
          />
        </Labelled>
        <Labelled id={id('description')} label={t('description')}>
          <Textarea
            id={id('description')}
            rows={4}
            maxLength={4000}
            placeholder={pkg.description ?? ''}
            {...word('description')}
          />
        </Labelled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled id={id('included')} label={t('included')}>
            <Textarea
              id={id('included')}
              rows={4}
              placeholder={pkg.included.join('\n')}
              {...word('included')}
            />
          </Labelled>
          <Labelled id={id('excluded')} label={t('excluded')}>
            <Textarea
              id={id('excluded')}
              rows={4}
              placeholder={pkg.excluded.join('\n')}
              {...word('excluded')}
            />
          </Labelled>
        </div>
        <Labelled id={id('cubaNotes')} label={t('cubaNotes')}>
          <Textarea
            id={id('cubaNotes')}
            rows={3}
            maxLength={4000}
            placeholder={pkg.cubaNotes ?? ''}
            {...word('cubaNotes')}
          />
        </Labelled>
        <Labelled id={id('seoDescription')} label={t('seoDescription')}>
          <Textarea
            id={id('seoDescription')}
            rows={2}
            maxLength={400}
            placeholder={pkg.seoDescription ?? ''}
            {...word('seoDescription')}
          />
        </Labelled>
      </fieldset>

      {pkg.days.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-body-sm font-semibold">{t('days')}</legend>
          {pkg.days.map((day) => {
            const key = String(day.dayOffset);
            const row = dayRows[key]!;
            const set = (field: 'title' | 'body' | 'meals', value: string) =>
              setDayRows((current) => ({
                ...current,
                [key]: { ...row, [field]: value },
              }));
            return (
              <div key={key} className="flex flex-col gap-3 rounded-md border p-3">
                <span className="text-body-sm font-semibold">
                  {t('dayHeading', { number: day.dayOffset + 1 })}
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Labelled id={id(`day-${key}-title`)} label={t('dayTitle')}>
                    <Input
                      id={id(`day-${key}-title`)}
                      value={row.title}
                      placeholder={day.title}
                      onChange={(event) => set('title', event.target.value)}
                    />
                  </Labelled>
                  <Labelled id={id(`day-${key}-meals`)} label={t('dayMeals')}>
                    <Input
                      id={id(`day-${key}-meals`)}
                      value={row.meals}
                      placeholder={day.meals ?? ''}
                      onChange={(event) => set('meals', event.target.value)}
                    />
                  </Labelled>
                </div>
                <Labelled id={id(`day-${key}-body`)} label={t('dayBody')}>
                  <Textarea
                    id={id(`day-${key}-body`)}
                    rows={3}
                    value={row.body}
                    placeholder={day.body ?? ''}
                    onChange={(event) => set('body', event.target.value)}
                  />
                </Labelled>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      {pkg.tiers.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-body-sm font-semibold">{t('tiers')}</legend>
          {pkg.tiers.map((tier) => {
            const row = tierRows[tier.code]!;
            const set = (field: 'name' | 'description', value: string) =>
              setTierRows((current) => ({
                ...current,
                [tier.code]: { ...row, [field]: value },
              }));
            return (
              <div key={tier.code} className="grid gap-3 sm:grid-cols-2">
                <Labelled
                  id={id(`tier-${tier.code}-name`)}
                  label={`${t('tierName')} · ${tier.code}`}
                >
                  <Input
                    id={id(`tier-${tier.code}-name`)}
                    value={row.name}
                    placeholder={tier.name}
                    onChange={(event) => set('name', event.target.value)}
                  />
                </Labelled>
                <Labelled
                  id={id(`tier-${tier.code}-description`)}
                  label={t('tierDescription')}
                >
                  <Input
                    id={id(`tier-${tier.code}-description`)}
                    value={row.description}
                    placeholder={tier.description ?? ''}
                    onChange={(event) => set('description', event.target.value)}
                  />
                </Labelled>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      {pkg.extras.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-body-sm font-semibold">{t('extras')}</legend>
          {pkg.extras.map((extra) => {
            const row = extraRows[extra.code]!;
            const set = (
              field: 'name' | 'description' | 'durationLabel',
              value: string,
            ) =>
              setExtraRows((current) => ({
                ...current,
                [extra.code]: { ...row, [field]: value },
              }));
            return (
              <div key={extra.code} className="grid gap-3 sm:grid-cols-3">
                <Labelled
                  id={id(`extra-${extra.code}-name`)}
                  label={`${t('extraName')} · ${extra.code}`}
                >
                  <Input
                    id={id(`extra-${extra.code}-name`)}
                    value={row.name}
                    placeholder={extra.name}
                    onChange={(event) => set('name', event.target.value)}
                  />
                </Labelled>
                <Labelled
                  id={id(`extra-${extra.code}-description`)}
                  label={t('extraDescription')}
                >
                  <Input
                    id={id(`extra-${extra.code}-description`)}
                    value={row.description}
                    placeholder={extra.description ?? ''}
                    onChange={(event) => set('description', event.target.value)}
                  />
                </Labelled>
                <Labelled
                  id={id(`extra-${extra.code}-duration`)}
                  label={t('extraDuration')}
                >
                  <Input
                    id={id(`extra-${extra.code}-duration`)}
                    value={row.durationLabel}
                    placeholder={extra.durationLabel ?? ''}
                    onChange={(event) => set('durationLabel', event.target.value)}
                  />
                </Labelled>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      {pkg.media.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-body-sm font-semibold">{t('photos')}</legend>
          {pkg.media.map((photo, index) => {
            const label =
              index === 0 ? media('hero') : media('gallery', { number: index });
            return (
              <Labelled
                key={photo.id}
                id={id(`media-${photo.id}`)}
                label={t('photoAlt', { label })}
              >
                <Input
                  id={id(`media-${photo.id}`)}
                  value={altRows[photo.id] ?? ''}
                  maxLength={300}
                  placeholder={photo.altText}
                  onChange={(event) =>
                    setAltRows((current) => ({
                      ...current,
                      [photo.id]: event.target.value,
                    }))
                  }
                />
              </Labelled>
            );
          })}
        </fieldset>
      ) : null}

      <Checkbox
        checked={published}
        onChange={(event) => setPublished(event.target.checked)}
        label={t('published')}
      />
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {saved ? <Alert variant="success">{t('saved')}</Alert> : null}
      <Button type="submit" className="self-start" disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
