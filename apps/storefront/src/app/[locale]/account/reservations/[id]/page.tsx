import { DEFAULT_LOCALE } from '@ota/i18n';
import type { MyReservationDetailDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { MessageThread } from '@/components/message-thread';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';

export default async function AccountReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) {
    const locale = await getLocale();
    redirect(locale === DEFAULT_LOCALE ? '/login' : `/${locale}/login`);
  }

  const reservation = await apiFetch<MyReservationDetailDto>(
    `/me/reservations/${id}`,
  ).catch(() => null);
  if (!reservation) {
    notFound();
  }

  const t = await getTranslations('account');
  const tr = await getTranslations('status.reservation');
  const tsi = await getTranslations('status.serviceItem');
  const tst = await getTranslations('status.serviceType');
  const td = await getTranslations('status.document');

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/account"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('back')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {reservation.bookingCode}
        </h1>
        <Badge variant="secondary">{tr(reservation.status)}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('booking')}</CardTitle>
          <CardDescription>
            {new Date(reservation.startDate).toLocaleDateString()} →{' '}
            {new Date(reservation.endDate).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {reservation.totalCurrency} {Number(reservation.totalAmount).toFixed(2)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('itinerary')}</CardTitle>
          <CardDescription>
            {t('serviceCount', { count: reservation.serviceItems.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reservation.serviceItems.length === 0 ? (
            <Alert>{t('itineraryAssembling')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.type')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.province')}</TableHead>
                  <TableHead>{t('columns.starts')}</TableHead>
                  <TableHead>{t('columns.ends')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservation.serviceItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{tst(item.serviceType)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tsi(item.status)}</Badge>
                    </TableCell>
                    <TableCell>{item.province ?? '—'}</TableCell>
                    <TableCell>
                      {new Date(item.serviceDateStart).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {new Date(item.serviceDateEnd).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('documents')}</CardTitle>
          <CardDescription>
            {t('documentCount', { count: reservation.documents.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reservation.documents.length === 0 ? (
            <Alert>{t('documentsEmpty')}</Alert>
          ) : (
            <ul className="space-y-2 text-sm">
              {reservation.documents.map((document) => (
                <li key={document.id} className="flex items-center gap-3">
                  <Badge variant="outline">{td(document.type)}</Badge>
                  <a
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    href={`/api/ota/documents/${document.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('download')}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <MessageThread reservationId={reservation.id} />
    </div>
  );
}
