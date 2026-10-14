'use client';

import { Alert, Button, Checkbox, cn, Input, Label, Stepper, Textarea } from '@ota/ui';
import type { StepperStep } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const CATEGORIES = [
  'TOUR_GUIDE',
  'PRIVATE_DRIVER',
  'HOMESTAY_HOST',
  'TRANSLATOR',
] as const;
type Category = (typeof CATEGORIES)[number];

const STEPS = ['category', 'identity', 'credential', 'review'] as const;
type Step = (typeof STEPS)[number];

interface Draft {
  category: Category | null;
  fullName: string;
  email: string;
  phone: string;
  provinces: string[];
  license: string;
  message: string;
}

/**
 * The partner application (Join board; spec §4.6): category, identity,
 * credential, then a review with the two consents, each step checked before
 * the next. It creates a pending application for the desk. The board's
 * national ID, municipalities, languages and licence photo need fields the
 * application does not have yet (M-batch) and an upload the public form
 * cannot make, so the desk collects them on the sign-up call.
 */
export function ApplicationForm({
  provinces,
  agencyName,
}: {
  /** Province names, west to east, from the map. */
  provinces: readonly string[];
  agencyName: string;
}) {
  const t = useTranslations('join');
  const [step, setStep] = useState<Step>('category');
  const [draft, setDraft] = useState<Draft>({
    category: null,
    fullName: '',
    email: '',
    phone: '',
    provinces: [],
    license: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consents, setConsents] = useState({ verify: false, own: false });
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const index = STEPS.indexOf(step);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function check(current: Step): Record<string, string> {
    const found: Record<string, string> = {};
    if (current === 'category' && !draft.category) found.category = t('errors.category');
    if (current === 'identity') {
      if (!draft.fullName.trim()) found.fullName = t('errors.fullName');
      if (!/^\S+@\S+\.\S+$/.test(draft.email)) found.email = t('errors.email');
      if (!draft.phone.trim()) found.phone = t('errors.phone');
      if (draft.provinces.length === 0) found.provinces = t('errors.provinces');
    }
    if (current === 'credential' && !draft.license.trim())
      found.license = t('errors.license');
    if (current === 'review' && !(consents.verify && consents.own)) {
      found.consents = t('errors.consents');
    }
    return found;
  }

  function go(next: Step) {
    setStep(next);
    setErrors({});
    // Move focus to the step's heading so a screen reader hears where it is.
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = check(step);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    if (step !== 'review') {
      go(STEPS[index + 1]!);
      return;
    }
    setStatus('sending');
    setFailure(null);
    try {
      const response = await fetch('/api/ota/supplier-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          category: draft.category,
          provincesActive: draft.provinces,
          rtnLicenseNumber: draft.license.trim(),
          message: draft.message.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(t('error'));
      }
      setStatus('sent');
    } catch (submitError) {
      setStatus('error');
      setFailure(submitError instanceof Error ? submitError.message : t('error'));
    }
  }

  if (status === 'sent') {
    return (
      <Alert variant="success" title={t('sentTitle')}>
        {t('sent')}
      </Alert>
    );
  }

  const steps: StepperStep[] = STEPS.map((id, position) => ({
    id,
    label: t(`steps.${id}`),
    state: position < index ? 'done' : position === index ? 'current' : 'upcoming',
  }));
  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`app-${key}-error`} className="text-body-sm text-error-600">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form noValidate className="flex flex-col gap-6" onSubmit={onSubmit}>
      <Stepper
        steps={steps}
        progressLabel={t('stepProgress', {
          step: index + 1,
          total: STEPS.length,
          label: t(`steps.${step}`),
        })}
      />
      <h3
        id="app-step-title"
        ref={heading}
        tabIndex={-1}
        className="text-h4 text-default focus:outline-none"
      >
        {t(`stepTitles.${step}`)}
      </h3>

      {step === 'category' ? (
        <div
          role="radiogroup"
          aria-labelledby="app-step-title"
          aria-describedby="app-category-note"
          className="flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((category) => (
              <label
                key={category}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 transition-colors hover:border-primary-600',
                  draft.category === category &&
                    'border-2 border-primary-600 bg-primary-50',
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={category}
                  checked={draft.category === category}
                  onChange={() => update('category', category)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary-600"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-body font-semibold text-default">
                    {t(`categories.${category}`)}
                  </span>
                  <span className="text-caption text-muted">
                    {t(`categoryHints.${category}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p id="app-category-note" className="text-caption text-muted">
            {t('categoryNote')}
          </p>
          {fieldError('category')}
        </div>
      ) : null}

      {step === 'identity' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['fullName', 'text', 'name'],
              ['email', 'email', 'email'],
              ['phone', 'tel', 'tel'],
            ] as const
          ).map(([key, type, autoComplete]) => (
            <div
              key={key}
              className={cn(
                'flex flex-col gap-1.5',
                key === 'fullName' && 'sm:col-span-2',
              )}
            >
              <Label htmlFor={`app-${key}`}>{t(key)}</Label>
              <Input
                id={`app-${key}`}
                type={type}
                autoComplete={autoComplete}
                value={draft[key]}
                aria-invalid={errors[key] ? true : undefined}
                aria-describedby={errors[key] ? `app-${key}-error` : undefined}
                onChange={(event) => update(key, event.target.value)}
              />
              {fieldError(key)}
            </div>
          ))}
          <fieldset
            className="flex flex-col gap-2 sm:col-span-2"
            aria-describedby={
              errors.provinces ? 'app-provinces-error' : 'app-provinces-hint'
            }
          >
            <legend className="text-body-sm font-medium text-default">
              {t('provinces')}
            </legend>
            <p id="app-provinces-hint" className="text-caption text-muted">
              {t('provincesHint')}
            </p>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {provinces.map((province) => (
                <Checkbox
                  key={province}
                  label={province}
                  checked={draft.provinces.includes(province)}
                  onChange={(event) =>
                    update(
                      'provinces',
                      event.target.checked
                        ? [...draft.provinces, province]
                        : draft.provinces.filter((item) => item !== province),
                    )
                  }
                />
              ))}
            </div>
            {fieldError('provinces')}
          </fieldset>
        </div>
      ) : null}

      {step === 'credential' && draft.category ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-license">{t(`licenses.${draft.category}`)}</Label>
            <Input
              id="app-license"
              value={draft.license}
              aria-invalid={errors.license ? true : undefined}
              aria-describedby={errors.license ? 'app-license-error' : 'app-license-hint'}
              onChange={(event) => update('license', event.target.value)}
            />
            <p id="app-license-hint" className="text-caption text-muted">
              {t('licenseHint')}
            </p>
            {fieldError('license')}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-message">{t('message')}</Label>
            <Textarea
              id="app-message"
              rows={4}
              value={draft.message}
              onChange={(event) => update('message', event.target.value)}
            />
          </div>
        </div>
      ) : null}

      {step === 'review' && draft.category ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg bg-sunken p-4 text-body-sm">
            <dt className="text-secondary">{t('category')}</dt>
            <dd className="font-semibold text-default">
              {t(`categories.${draft.category}`)}
            </dd>
            <dt className="text-secondary">{t('contact')}</dt>
            <dd className="font-semibold text-default">
              {draft.fullName} · {draft.email} · {draft.phone}
            </dd>
            <dt className="text-secondary">{t('provinces')}</dt>
            <dd className="font-semibold text-default">{draft.provinces.join(', ')}</dd>
            <dt className="text-secondary">{t(`licenses.${draft.category}`)}</dt>
            <dd className="font-mono font-semibold text-default">{draft.license}</dd>
          </dl>
          <div
            className="flex flex-col"
            aria-describedby={errors.consents ? 'app-consents-error' : undefined}
          >
            <Checkbox
              label={t('consentVerify', { agency: agencyName })}
              checked={consents.verify}
              onChange={(event) =>
                setConsents({ ...consents, verify: event.target.checked })
              }
            />
            <Checkbox
              label={t('consentOwn')}
              checked={consents.own}
              onChange={(event) =>
                setConsents({ ...consents, own: event.target.checked })
              }
            />
            {fieldError('consents')}
          </div>
        </div>
      ) : null}

      {failure ? <Alert variant="destructive">{failure}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        {index > 0 ? (
          <Button variant="secondary" size="lg" onClick={() => go(STEPS[index - 1]!)}>
            {t('back')}
          </Button>
        ) : null}
        <Button type="submit" size="lg" loading={status === 'sending'}>
          {step === 'review'
            ? status === 'sending'
              ? t('applying')
              : t('apply')
            : t('continue')}
        </Button>
      </div>
    </form>
  );
}
