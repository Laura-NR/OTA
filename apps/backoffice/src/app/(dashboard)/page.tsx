import { UserRole } from '@ota/domain';
import type { ReservationDto } from '@ota/schemas';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';

import { ReservationsTable } from '@/components/reservations-table';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function ReservationsPage() {
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  let reservations: ReservationDto[] = [];
  let loadError: string | null = null;
  try {
    reservations = await apiFetch<ReservationDto[]>('/reservations');
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load reservations.';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reservations</h1>
        <p className="text-sm text-muted-foreground">
          The operations pipeline, newest first. Advance a booking through its legal
          status transitions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>{reservations.length} booking(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">{loadError}</Alert>
          ) : (
            <ReservationsTable reservations={reservations} canManage={canManage} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
