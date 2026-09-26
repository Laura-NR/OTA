'use client';

import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FormEvent } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const CATEGORIES = [
  'TOUR_GUIDE',
  'PRIVATE_DRIVER',
  'HOMESTAY_HOST',
  'TRANSLATOR',
] as const;

/** Public supplier recruitment form (spec §4.6). Creates a PENDING application. */
export function ApplicationForm() {
  const t = useTranslations('join');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('sending');
    setError(null);

    const provinces = String(form.get('provincesActive') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const response = await fetch('/api/ota/supplier-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          email: form.get('email'),
          phone: form.get('phone'),
          category: form.get('category'),
          provincesActive: provinces,
          rtnLicenseNumber: form.get('rtnLicenseNumber'),
          message: form.get('message') || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(t('error'));
      }
      setStatus('sent');
    } catch (submitError) {
      setStatus('error');
      setError(submitError instanceof Error ? submitError.message : t('error'));
    }
  }

  if (status === 'sent') {
    return <Alert variant="success">{t('sent')}</Alert>;
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="app-name">{t('fullName')}</Label>
          <Input id="app-name" name="fullName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-email">{t('email')}</Label>
          <Input id="app-email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-phone">{t('phone')}</Label>
          <Input id="app-phone" name="phone" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-category">{t('category')}</Label>
          <Select id="app-category" name="category" defaultValue="TOUR_GUIDE">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-provinces">{t('provinces')}</Label>
          <Input
            id="app-provinces"
            name="provincesActive"
            required
            placeholder={t('provincesPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-license">{t('license')}</Label>
          <Input id="app-license" name="rtnLicenseNumber" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="app-message">{t('message')}</Label>
        <textarea
          id="app-message"
          name="message"
          rows={4}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-ota-1 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? t('applying') : t('apply')}
      </Button>
    </form>
  );
}
