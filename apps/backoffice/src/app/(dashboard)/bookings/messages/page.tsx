import type { ReservationListItemDto } from '@ota/schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { MessageThread } from '@/components/message-thread';
import { PageHeader } from '@/components/page-header';
import { ReservationPicker } from '@/components/reservation-picker';
import { apiFetch } from '@/lib/api';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string }>;
}) {
  const { reservation } = await searchParams;
  const t = await getTranslations('backoffice.messages');

  let reservations: ReservationListItemDto[];
  try {
    reservations = await apiFetch<ReservationListItemDto[]>('/reservations');
  } catch {
    reservations = [];
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <ReservationPicker
        id="messages-reservation"
        action="/messages"
        reservations={reservations}
        selectedId={reservation}
      />

      {reservation ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('conversation')}</CardTitle>
            <CardDescription>
              {t('reservationLabel', { id: reservation })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MessageThread reservationId={reservation} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
