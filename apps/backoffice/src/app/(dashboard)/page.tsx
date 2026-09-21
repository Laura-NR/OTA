import { UserRole } from '@ota/domain';
import type { ReservationListItemDto } from '@ota/schemas';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { PipelineBoard } from '@/components/pipeline-board';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function ReservationsPage() {
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  let reservations: ReservationListItemDto[] = [];
  let loadError: string | null = null;
  try {
    reservations = await apiFetch<ReservationListItemDto[]>('/reservations');
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load reservations.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        description="The operations pipeline, grouped by status. Open a booking to transition, inspect, and audit it."
      >
        {canManage ? (
          <Link
            href="/reservations/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New reservation
          </Link>
        ) : null}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>{reservations.length} booking(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">{loadError}</Alert>
          ) : (
            <PipelineBoard reservations={reservations} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
