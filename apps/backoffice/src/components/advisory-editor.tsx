'use client';

import { ADVISORY_SEVERITIES, zonedInstant, zonedWallClock } from '@ota/domain';
import type { AdvisorySeverity } from '@ota/domain';
import type { AdvisoryDto, AdvisoryWriteRequest } from '@ota/schemas';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  CrisisBanner,
  Input,
  Label,
  Radio,
  RadioGroup,
  Select,
  Tabs,
  Textarea,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { BANNER_SEVERITY, type RegionGroup } from '@/lib/advisories';
import { apiRequest } from '@/lib/client-api';

interface Text {
  headline: string;
  body: string;
  cta: string;
}

const DAY_MS = 86_400_000;

function emptyTexts(locales: readonly string[]): Record<string, Text> {
  return Object.fromEntries(
    locales.map((locale) => [locale, { headline: '', body: '', cta: '' }]),
  );
}

/**
 * A-Content's advisory editor: severity, regions, window, where it shows, the
 * source and the text per tenant language, with the DS 03 banner preview of
 * the language on screen. It creates a draft or saves one; publishing is the
 * approval panel's job.
 */
export function AdvisoryEditor({
  advisory,
  locales,
  defaultSourceLocale,
  provinces,
  groups,
  serverNow,
}: {
  advisory: AdvisoryDto | null;
  locales: readonly string[];
  defaultSourceLocale: string;
  provinces: readonly { code: string; name: string }[];
  groups: readonly RegionGroup[];
  /** The page's render time, so the default window hydrates identically. */
  serverNow: string;
}) {
  const t = useTranslations('advisoriesDesk');
  const traveler = useTranslations('advisories');
  const router = useRouter();
  const now = new Date(serverNow);

  const [severity, setSeverity] = useState<AdvisorySeverity>(
    advisory?.severity ?? 'INFO',
  );
  const [regions, setRegions] = useState<string[]>(advisory?.regions ?? []);
  const [from, setFrom] = useState(
    zonedWallClock(advisory ? new Date(advisory.effectiveFrom) : now),
  );
  const [to, setTo] = useState(
    zonedWallClock(
      advisory ? new Date(advisory.expiresAt) : new Date(now.getTime() + 14 * DAY_MS),
    ),
  );
  const [source, setSource] = useState(advisory?.source ?? '');
  const [sourceLocale, setSourceLocale] = useState(
    advisory?.sourceLocale ?? defaultSourceLocale,
  );
  const [showOnSite, setShowOnSite] = useState(advisory?.showOnSite ?? true);
  const [showOnPackages, setShowOnPackages] = useState(advisory?.showOnPackages ?? true);
  const [notifyTravelers, setNotifyTravelers] = useState(
    advisory?.notifyTravelers ?? true,
  );
  const [texts, setTexts] = useState<Record<string, Text>>(() => {
    const base = emptyTexts(locales);
    for (const item of advisory?.translations ?? []) {
      base[item.locale] = {
        headline: item.headline,
        body: item.body,
        cta: item.cta ?? '',
      };
    }
    return base;
  });
  const [tab, setTab] = useState(advisory?.sourceLocale ?? defaultSourceLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (code: string) =>
    setRegions((current) =>
      current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code],
    );
  const addGroup = (codes: readonly string[]) =>
    setRegions((current) => [...new Set([...current, ...codes])]);
  const setText = (locale: string, field: keyof Text, value: string) =>
    setTexts((current) => ({
      ...current,
      [locale]: { ...current[locale]!, [field]: value },
    }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const effectiveFrom = zonedInstant(from);
    const expiresAt = zonedInstant(to);
    if (!effectiveFrom || !expiresAt) {
      setError(t('editor.invalidDate'));
      return;
    }
    const sourceText = texts[sourceLocale];
    if (!sourceText?.headline.trim() || !sourceText.body.trim()) {
      setError(t('editor.needsSource'));
      setTab(sourceLocale);
      return;
    }
    const body: AdvisoryWriteRequest = {
      severity,
      regions,
      effectiveFrom,
      expiresAt,
      source,
      sourceLocale,
      showOnSite,
      showOnPackages,
      notifyTravelers,
      translations: locales.flatMap((locale) => {
        const text = texts[locale]!;
        return text.headline.trim() && text.body.trim()
          ? [
              {
                locale,
                headline: text.headline,
                body: text.body,
                cta: text.cta.trim() || null,
              },
            ]
          : [];
      }),
    };
    setBusy(true);
    setError(null);
    try {
      const saved = await apiRequest<AdvisoryDto>(
        advisory ? `/advisories/${advisory.id}` : '/advisories',
        { method: advisory ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      if (advisory) {
        router.refresh();
      } else {
        router.push(`/content/advisories/${saved.id}`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('editor.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const preview = texts[tab] ?? texts[sourceLocale]!;

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit} aria-label={t('newTitle')}>
      <Card>
        <CardHeader>
          <CardTitle>{t('editor.preview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <CrisisBanner
              key={`${severity}-${tab}`}
              severity={BANNER_SEVERITY[severity]}
              label={t('editor.preview')}
              title={preview.headline || t('editor.previewEmpty')}
              className="static"
              action={
                preview.cta ? (
                  <span className="whitespace-nowrap font-semibold underline underline-offset-[3px]">
                    {preview.cta}
                  </span>
                ) : null
              }
              acknowledgeLabel={traveler('acknowledge')}
              dismissLabel={traveler('dismiss')}
              onDismiss={() => undefined}
            >
              {preview.body}
            </CrisisBanner>
          </div>
          <p className="mt-2 text-caption text-muted">{t(`severityHints.${severity}`)}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardContent className="flex flex-col gap-5 pt-6">
            <RadioGroup legend={t('editor.severity')}>
              {ADVISORY_SEVERITIES.map((value) => (
                <Radio
                  key={value}
                  name="severity"
                  value={value}
                  checked={severity === value}
                  onChange={() => setSeverity(value)}
                  label={t(`severities.${value}`)}
                  description={t(`severityHints.${value}`)}
                />
              ))}
            </RadioGroup>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-sm font-medium text-default">
                {t('editor.regions')}
              </legend>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={regions.length === 0 ? 'primary' : 'secondary'}
                  aria-pressed={regions.length === 0}
                  onClick={() => setRegions([])}
                >
                  {t('editor.wholeCountry')}
                </Button>
                {groups.map((group) => (
                  <Button
                    key={group.key}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => addGroup(group.codes)}
                  >
                    {t(`editor.regionGroups.${group.key}`)}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {provinces.map((province) => (
                  <Checkbox
                    key={province.code}
                    label={province.name}
                    checked={regions.includes(province.code)}
                    onChange={() => toggle(province.code)}
                    className="py-1.5"
                  />
                ))}
              </div>
              <p className="text-caption text-muted">{t('editor.regionsHint')}</p>
            </fieldset>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="flex flex-col gap-5 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="advisory-from">{t('editor.effectiveFrom')}</Label>
                <Input
                  id="advisory-from"
                  type="datetime-local"
                  required
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="advisory-to">{t('editor.expiresAt')}</Label>
                <Input
                  id="advisory-to"
                  type="datetime-local"
                  required
                  aria-describedby="advisory-to-hint"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
                <p id="advisory-to-hint" className="text-caption text-muted">
                  {t('editor.expiresHint')}
                </p>
              </div>
            </div>

            <fieldset className="flex flex-col">
              <legend className="text-body-sm font-medium text-default">
                {t('editor.showsOn')}
              </legend>
              <Checkbox
                label={t('editor.showOnSite')}
                checked={showOnSite}
                onChange={(event) => setShowOnSite(event.target.checked)}
              />
              <Checkbox
                label={t('editor.showOnPackages')}
                checked={showOnPackages}
                onChange={(event) => setShowOnPackages(event.target.checked)}
              />
              <Checkbox
                label={t('editor.notifyTravelers')}
                checked={notifyTravelers}
                disabled={severity === 'INFO'}
                onChange={(event) => setNotifyTravelers(event.target.checked)}
              />
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="advisory-source">{t('editor.source')}</Label>
              <Input
                id="advisory-source"
                required
                maxLength={300}
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="advisory-source-locale">{t('editor.sourceLocale')}</Label>
              <Select
                id="advisory-source-locale"
                value={sourceLocale}
                onChange={(event) => setSourceLocale(event.target.value)}
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('editor.texts')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Tabs
            label={t('editor.texts')}
            value={tab}
            onValueChange={setTab}
            items={locales.map((locale) => {
              const text = texts[locale]!;
              const filled = Boolean(text.headline.trim() && text.body.trim());
              return {
                id: locale,
                label: filled
                  ? locale.toUpperCase()
                  : `${locale.toUpperCase()} · ${t('editor.missing')}`,
                panel: (
                  <div className="flex flex-col gap-4 pt-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`advisory-headline-${locale}`}>
                        {t('editor.headline')}
                      </Label>
                      <Input
                        id={`advisory-headline-${locale}`}
                        lang={locale}
                        maxLength={160}
                        required={locale === sourceLocale}
                        value={text.headline}
                        onChange={(event) =>
                          setText(locale, 'headline', event.target.value)
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`advisory-body-${locale}`}>
                        {t('editor.body')}
                      </Label>
                      <Textarea
                        id={`advisory-body-${locale}`}
                        lang={locale}
                        rows={4}
                        maxLength={2000}
                        required={locale === sourceLocale}
                        value={text.body}
                        onChange={(event) => setText(locale, 'body', event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`advisory-cta-${locale}`}>{t('editor.cta')}</Label>
                      <Input
                        id={`advisory-cta-${locale}`}
                        lang={locale}
                        maxLength={80}
                        aria-describedby={`advisory-cta-hint-${locale}`}
                        value={text.cta}
                        onChange={(event) => setText(locale, 'cta', event.target.value)}
                      />
                      <p
                        id={`advisory-cta-hint-${locale}`}
                        className="text-caption text-muted"
                      >
                        {t('editor.ctaHint')}
                      </p>
                    </div>
                  </div>
                ),
              };
            })}
          />
          <p className="text-caption text-muted">{t('editor.translationsHint')}</p>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t('editor.saving') : advisory ? t('editor.save') : t('editor.create')}
        </Button>
        {advisory && advisory.approvals.length > 0 ? (
          <span className="text-caption text-muted">{t('editor.clearsApproval')}</span>
        ) : null}
      </div>
    </form>
  );
}
