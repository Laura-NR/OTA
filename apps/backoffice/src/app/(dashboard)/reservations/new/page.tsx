import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';

import { PageHeader } from '@/components/page-header';
import { ReservationCreateForm } from '@/components/reservation-create-form';

export default function NewReservationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New reservation"
        description="Ops-side intake. The storefront builder will submit the same shape at ITINERARY_SUBMITTED."
      />

      <Card>
        <CardHeader>
          <CardTitle>Booking details</CardTitle>
          <CardDescription>
            Bookings start in DRAFT and advance through legal transitions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReservationCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
