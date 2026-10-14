'use client';

import { Alert, Button, buttonClassName, cn, Icon, Input, Label } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { BookingModelPill } from '@/components/package-card';
import { Link, useRouter } from '@/i18n/navigation';

export interface PackageBookingFormProps {
  packageId: string;
  slug: string;
  signedIn: boolean;
  /** The package price, formatted for the visitor's locale. */
  price: string;
  instant: boolean;
  /** The agency's phone line from the manifest, for "Call to book". */
  supportPhone: string | null;
}

/**
 * The Package board's sticky summary: the price and booking model, then the
 * request itself (spec §3.3). The server expands the package into service
 * items; the client only supplies dates. Departures, travelers and casa tiers
 * join with the package model (M1); a guest request without an account waits
 * for guest provisioning (Q6), so a signed-out visitor signs in first.
 */
export function PackageBookingForm({
  packageId,
  slug,
  signedIn,
  price,
  instant,
  supportPhone,
}: PackageBookingFormProps) {
  const t = useTranslations('packages');
  const router = useRouter();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const datesValid =
    Boolean(startDate && endDate) && new Date(endDate) >= new Date(startDate);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/ota/me/reservations/from-package', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageId, startDate, endDate }),
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
    <aside
      aria-label={t('detail.bookLabel')}
      className="flex flex-col gap-4 rounded-lg border bg-surface p-6 shadow-md lg:sticky lg:top-24"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-caption text-muted">{t('fromLabel')}</p>
          <p className="text-h1-compact font-body font-bold text-default">{price}</p>
        </div>
        <BookingModelPill instant={instant} />
      </div>

      {!signedIn ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-secondary">{t('signInPrompt')}</p>
          <Link
            href={`/login?next=${encodeURIComponent(`/packages/${slug}`)}`}
            className={buttonClassName({ size: 'lg' })}
          >
            {t('signIn')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="package-start">{t('startDate')}</Label>
            <Input
              id="package-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="package-end">{t('endDate')}</Label>
            <Input
              id="package-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          {startDate && endDate && !datesValid ? (
            <Alert variant="destructive">{t('dateError')}</Alert>
          ) : null}
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <Button size="lg" disabled={!datesValid} loading={busy} onClick={submit}>
            {busy ? t('booking') : t('book')}
          </Button>
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-caption text-muted">
        <Icon name="lock" className="h-3.5 w-3.5" />
        {t('detail.nothingCharged')}
      </p>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Link
          href="/support#contact"
          className={cn(buttonClassName({ variant: 'secondary' }), 'flex-1')}
        >
          <Icon name="message-circle" />
          {t('detail.ask')}
        </Link>
        {supportPhone ? (
          <a
            href={`tel:${supportPhone.replace(/[^\d+]/g, '')}`}
            className={cn(buttonClassName({ variant: 'tertiary' }), 'flex-1')}
          >
            {t('detail.call')}
          </a>
        ) : null}
      </div>
    </aside>
  );
}
