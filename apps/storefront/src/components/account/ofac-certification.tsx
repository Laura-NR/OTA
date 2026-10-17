'use client';

import { OFAC_CATEGORIES } from '@ota/domain';
import type { ReservationOfacDto, TravelerOfacDto } from '@ota/schemas';
import { Alert, Badge, Button, Input, Label, Select } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

/**
 * The OFAC step on a trip (Booking board step 4, M3): each US traveler picks
 * their travel category and types their full name as a signature under the
 * agency's statement. Payment stays locked until every one of them has signed;
 * the API checks the name and keeps the statement version, IP and browser.
 */
export function OfacCertification({
  reservationId,
  ofac,
}: {
  reservationId: string;
  ofac: ReservationOfacDto;
}) {
  const t = useTranslations('account.ofac');
  const categories = useTranslations('ofac.categories');
  const required = ofac.travelers.filter((traveler) => traveler.required);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-secondary">{t('lede')}</p>
      {ofac.missing > 0 ? <Alert variant="warning">{t('locked')}</Alert> : null}
      <ul className="flex flex-col gap-4">
        {required.map((traveler) => (
          <li key={traveler.travelerId} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body font-semibold text-default">
                {traveler.fullName}
              </span>
              {traveler.affidavit ? (
                <Badge variant="success">
                  {t('certified', { category: categories(traveler.affidavit.category) })}
                </Badge>
              ) : null}
            </div>
            {!traveler.affidavit && ofac.statement ? (
              <SignForm
                reservationId={reservationId}
                traveler={traveler}
                statement={ofac.statement}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignForm({
  reservationId,
  traveler,
  statement,
}: {
  reservationId: string;
  traveler: TravelerOfacDto;
  statement: { version: string; text: string };
}) {
  const t = useTranslations('account.ofac');
  const categories = useTranslations('ofac.categories');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = (field: string) => `ofac-${traveler.travelerId}-${field}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ota/me/reservations/${reservationId}/travelers/${traveler.travelerId}/affidavit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            category: form.get('category'),
            signature: form.get('signature'),
            statementVersion: statement.version,
            locale,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? t('failed'));
      }
      router.refresh();
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : t('failed'));
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border bg-surface p-4"
      onSubmit={onSubmit}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={id('category')}>{t('category')}</Label>
        <Select
          id={id('category')}
          name="category"
          defaultValue="SUPPORT_FOR_THE_CUBAN_PEOPLE"
        >
          {OFAC_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {categories(category)}
            </option>
          ))}
        </Select>
      </div>
      <figure className="flex flex-col gap-1">
        <figcaption className="text-caption font-semibold uppercase text-muted">
          {t('statement')}
        </figcaption>
        <blockquote className="border-l-[3px] border-primary-600 pl-3 text-body-sm text-default">
          {statement.text}
        </blockquote>
      </figure>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={id('signature')}>
          {t('signature', { name: traveler.fullName })}
        </Label>
        <Input
          id={id('signature')}
          name="signature"
          required
          maxLength={200}
          autoComplete="off"
          aria-describedby={id('signature-hint')}
        />
        <span id={id('signature-hint')} className="text-caption text-muted">
          {t('signatureHint', { name: traveler.fullName })}
        </span>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button type="submit" className="self-start" disabled={busy}>
        {busy ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
