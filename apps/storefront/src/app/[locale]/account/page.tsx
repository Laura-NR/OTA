import { DEFAULT_LOCALE } from '@ota/i18n';
import type { MyReservationListItemDto } from '@ota/schemas';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { SignOutButton } from '@/components/sign-out-button';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';

export default async function AccountPage() {
  const session = await getServerSession();
  if (!session) {
    const locale = await getLocale();
    redirect(locale === DEFAULT_LOCALE ? '/login' : `/${locale}/login`);
  }

  const t = await getTranslations('account');
  const ts = await getTranslations('status.reservation');
  const reservations = await apiFetch<MyReservationListItemDto[]>('/me/reservations');

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('signedInAs', { email: session.user.email })}
          </p>
        </div>
        <SignOutButton />
      </div>

      {reservations.length === 0 ? (
        <Alert className="mt-6">{t('empty')}</Alert>
      ) : (
        <ul className="mt-6 space-y-3">
          {reservations.map((reservation) => (
            <li key={reservation.id}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">
                    <Link
                      href={`/account/reservations/${reservation.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {reservation.bookingCode}
                    </Link>
                  </CardTitle>
                  <Badge variant="secondary">{ts(reservation.status)}</Badge>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {new Date(reservation.startDate).toLocaleDateString()} →{' '}
                  {new Date(reservation.endDate).toLocaleDateString()} ·{' '}
                  {reservation.totalCurrency} {Number(reservation.totalAmount).toFixed(2)}{' '}
                  · {t('serviceCount', { count: reservation.serviceItemCount })} ·{' '}
                  {t('documentCount', { count: reservation.documentCount })}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
