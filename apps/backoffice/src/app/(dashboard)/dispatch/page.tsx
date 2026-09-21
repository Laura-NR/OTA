import { UserRole } from '@ota/domain';
import type { DispatchViewDto, ReservationDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';

import { CandidatesList } from '@/components/candidates-list';
import { StartDispatchButton } from '@/components/dispatch-controls';
import { PageHeader } from '@/components/page-header';
import { ReservationPicker } from '@/components/reservation-picker';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

function escalationVariant(
  escalation: DispatchViewDto['serviceItems'][number]['escalation'],
) {
  if (escalation === 'RED') return 'destructive' as const;
  if (escalation === 'AMBER') return 'secondary' as const;
  return 'outline' as const;
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string }>;
}) {
  const { reservation } = await searchParams;
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  let reservations: ReservationDto[] = [];
  let view: DispatchViewDto | null = null;
  let loadError: string | null = null;

  try {
    reservations = await apiFetch<ReservationDto[]>('/reservations');
    if (reservation) {
      view = await apiFetch<DispatchViewDto>(`/reservations/${reservation}/dispatch`);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load dispatch data.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch"
        description="Offers, deadlines, and escalation state for a reservation's service items."
      />

      <ReservationPicker
        id="dispatch-reservation"
        action="/dispatch"
        reservations={reservations}
        selectedId={reservation}
      />

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}

      {view ? (
        <Card>
          <CardHeader>
            <CardTitle>Reservation status: {view.status.replaceAll('_', ' ')}</CardTitle>
            <CardDescription>{view.serviceItems.length} service item(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StartDispatchButton
              reservationId={view.reservationId}
              canManage={canManage}
            />

            {view.serviceItems.length === 0 ? (
              <Alert>No service items on this reservation.</Alert>
            ) : (
              view.serviceItems.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {item.serviceType.replaceAll('_', ' ')} —{' '}
                      {item.status.replaceAll('_', ' ')}
                    </CardTitle>
                    <CardDescription>
                      {item.province ?? 'Any province'} · deadline:{' '}
                      {item.deadline ? new Date(item.deadline).toLocaleString() : '—'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Escalation</span>
                      <Badge variant={escalationVariant(item.escalation)}>
                        {item.escalation}
                      </Badge>
                      <span className="text-muted-foreground">Supplier</span>
                      <span>{item.supplierId ?? 'Unassigned'}</span>
                    </div>
                    {item.status === 'UNASSIGNED' || item.status === 'DECLINED' ? (
                      <CandidatesList serviceItemId={item.id} />
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
