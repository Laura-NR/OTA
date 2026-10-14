import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/page-header';
import { ReservationCreateForm } from '@/components/reservation-create-form';

export default async function NewReservationPage() {
  const t = await getTranslations('backoffice.intake');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('bookingDetails')}</CardTitle>
          <CardDescription>{t('bookingDetailsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReservationCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
