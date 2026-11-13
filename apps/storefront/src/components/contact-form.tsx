'use client';

import type { ContactTopic } from '@ota/schemas';
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { Link } from '@/i18n/navigation';

const TOPICS: readonly ContactTopic[] = [
  'planning',
  'booking',
  'payment',
  'entry',
  'accessibility',
  'partners',
  'complaint',
  'other',
];
const LOCALES = ['en', 'es', 'fr'] as const;

type FieldName = 'name' | 'email' | 'message' | 'consent';
type Status = 'idle' | 'sending' | 'sent' | 'failed' | 'unavailable';

/**
 * The Support board's "Write to us" form (T-Forms §00): errors under each field
 * in one sentence, focus on the first one, and the message goes to the agency
 * inbox through `POST /contact`.
 */
export function ContactForm({ agencyName }: { agencyName: string }) {
  const t = useTranslations('pages.support.form');
  const locale = useLocale();
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) ?? '').trim();

    const found: Partial<Record<FieldName, string>> = {};
    if (!value('name')) found.name = t('errors.required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email')))
      found.email = t('errors.email');
    if (value('message').length < 10) found.message = t('errors.messageShort');
    if (form.get('consent') !== 'on') found.consent = t('errors.consent');
    setErrors(found);
    const first = (['name', 'email', 'message', 'consent'] as const).find(
      (key) => found[key],
    );
    if (first) {
      formElement.querySelector<HTMLElement>(`#contact-${first}`)?.focus();
      return;
    }

    setStatus('sending');
    try {
      const response = await fetch('/api/ota/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: value('name'),
          email: value('email'),
          topic: value('topic'),
          bookingCode: value('bookingCode') || undefined,
          message: value('message'),
          replyLocale: value('replyLocale'),
          consent: true,
        }),
      });
      setStatus(
        response.ok ? 'sent' : response.status === 503 ? 'unavailable' : 'failed',
      );
    } catch {
      setStatus('failed');
    }
  }

  if (status === 'sent') {
    return <Alert variant="success">{t('sent')}</Alert>;
  }

  return (
    <form noValidate className="flex max-w-xl flex-col gap-4" onSubmit={onSubmit}>
      {status === 'failed' || status === 'unavailable' ? (
        <Alert variant="destructive">{t(status)}</Alert>
      ) : null}
      <Field
        id="contact-name"
        label={t('name')}
        hint={t('nameHint')}
        error={errors.name}
        required
      >
        {(control) => <Input name="name" autoComplete="name" {...control} />}
      </Field>
      <Field id="contact-email" label={t('email')} error={errors.email} required>
        {(control) => (
          <Input name="email" type="email" autoComplete="email" {...control} />
        )}
      </Field>
      <Field id="contact-topic" label={t('topic')}>
        {(control) => (
          <Select name="topic" defaultValue="planning" {...control}>
            {TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {t(`topics.${topic}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        id="contact-bookingCode"
        label={t('bookingCode')}
        requirement={t('bookingCodeHint')}
      >
        {(control) => <Input name="bookingCode" autoComplete="off" {...control} />}
      </Field>
      <Field id="contact-message" label={t('message')} error={errors.message} required>
        {(control) => <Textarea name="message" rows={6} {...control} />}
      </Field>
      <Field id="contact-replyLocale" label={t('replyIn')}>
        {(control) => (
          <Select
            name="replyLocale"
            defaultValue={
              LOCALES.includes(locale as (typeof LOCALES)[number]) ? locale : 'en'
            }
            {...control}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {t(`languages.${code}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-col gap-1">
        <Checkbox
          id="contact-consent"
          name="consent"
          label={t('consent', { agency: agencyName })}
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? 'contact-consent-error' : undefined}
        />
        {errors.consent ? (
          <p
            id="contact-consent-error"
            role="alert"
            className="text-body-sm text-error-600"
          >
            {errors.consent}
          </p>
        ) : null}
        <Link
          href="/legal/privacy"
          className="self-start text-body-sm text-primary-600 underline underline-offset-[3px]"
        >
          {t('privacyNotice')}
        </Link>
      </div>
      <Button type="submit" className="self-start" loading={status === 'sending'}>
        {status === 'sending' ? t('sending') : t('send')}
      </Button>
    </form>
  );
}
