'use client';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link, useRouter } from '@/i18n/navigation';

export interface PackageBookingFormProps {
  packageId: string;
  slug: string;
  signedIn: boolean;
  priceLabel: string;
}

/**
 * Books a curated package (spec §3.3). The server expands the package into
 * service items; the client only supplies dates.
 */
export function PackageBookingForm({
  packageId,
  slug,
  signedIn,
  priceLabel,
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
    <Card>
      <CardHeader>
        <CardTitle>{t('bookTitle')}</CardTitle>
        <CardDescription>{t('bookDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-lg font-semibold">{priceLabel}</p>

        {!signedIn ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('signInPrompt')}</p>
            <Link
              href={`/login?next=${encodeURIComponent(`/packages/${slug}`)}`}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t('signIn')}
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="package-start">{t('startDate')}</Label>
              <Input
                id="package-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
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
            <Button disabled={!datesValid || busy} onClick={submit}>
              {busy ? t('booking') : t('book')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
