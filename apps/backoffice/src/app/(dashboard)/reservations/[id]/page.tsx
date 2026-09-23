import { UserRole } from '@ota/domain';
import type {
  AuditLogEntryDto,
  DocumentDto,
  IncidentDto,
  PaymentReceiptDto,
  ReservationDetailDto,
} from '@ota/schemas';
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
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { IncidentLogForm } from '@/components/incident-log-form';
import { IncidentResolveButton } from '@/components/incident-resolve-button';
import { PaymentPanel } from '@/components/payment-panel';
import { ReservationActions } from '@/components/reservation-actions';
import { TourismCategoryControl } from '@/components/tourism-category-control';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  const reservation = await apiFetch<ReservationDetailDto>(`/reservations/${id}`).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    },
  );

  const [audit, documents, payments, incidents] = await Promise.all([
    apiFetch<AuditLogEntryDto[]>(`/reservations/${id}/audit`).catch(() => []),
    apiFetch<DocumentDto[]>(`/reservations/${id}/documents`).catch(() => []),
    apiFetch<PaymentReceiptDto[]>(`/reservations/${id}/payments`).catch(() => []),
    apiFetch<IncidentDto[]>(`/incidents?reservationId=${id}`).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Pipeline
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {reservation.bookingCode}
        </h1>
        <StatusBadge status={reservation.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking</CardTitle>
          <CardDescription>
            Status transitions are governed by the domain state machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Traveler
              </dt>
              <dd className="mt-1 text-sm">
                {reservation.travelerName ?? reservation.travelerEmail}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {reservation.travelerEmail}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Dates
              </dt>
              <dd className="mt-1 text-sm">
                {new Date(reservation.startDate).toLocaleDateString()} →{' '}
                {new Date(reservation.endDate).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Total
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {reservation.totalCurrency} {Number(reservation.totalAmount).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Services
              </dt>
              <dd className="mt-1 text-sm">{reservation.serviceItems.length}</dd>
            </div>
          </dl>

          <ReservationActions
            reservationId={reservation.id}
            status={reservation.status}
            canManage={canManage}
          />

          <TourismCategoryControl
            reservationId={reservation.id}
            category={reservation.tourismCategory}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Duty of care</CardTitle>
          <CardDescription>
            Incidents logged against this booking (spec §4.9.4).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {incidents.length === 0 ? (
            <Alert>No incidents logged.</Alert>
          ) : (
            <ul className="space-y-2 text-sm">
              {incidents.map((incident) => (
                <li key={incident.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        incident.severity === 'HIGH' || incident.severity === 'CRITICAL'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {incident.severity}
                    </Badge>
                    <span className="font-medium">{incident.category}</span>
                    <span className="text-xs text-muted-foreground">
                      {incident.resolvedAt ? 'Resolved' : 'Open'}
                    </span>
                    {incident.resolvedAt ? null : (
                      <span className="ml-auto">
                        <IncidentResolveButton incidentId={incident.id} />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground">{incident.description}</p>
                </li>
              ))}
            </ul>
          )}

          {canManage ? <IncidentLogForm reservationId={reservation.id} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Payment links are generated at SECURED_AND_INVOICED; confirming clears funds
            and confirms the booking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentPanel
            reservationId={reservation.id}
            status={reservation.status}
            canManage={canManage}
            receipts={payments}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service items</CardTitle>
          <CardDescription>
            {reservation.serviceItems.length} component(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reservation.serviceItems.length === 0 ? (
            <Alert>No service items on this booking yet.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservation.serviceItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.serviceType.replaceAll('_', ' ')}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {item.status.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.province ?? '—'}</TableCell>
                    <TableCell>
                      {new Date(item.serviceDateStart).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {new Date(item.serviceDateEnd).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.supplierId ?? 'Unassigned'}
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
          <CardTitle>Documents</CardTitle>
          <CardDescription>{documents.length} generated file(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <Alert>
              No documents yet. Confirm the booking, or use the Documents page to
              regenerate.
            </Alert>
          ) : (
            <ul className="space-y-2 text-sm">
              {documents.map((document) => (
                <li key={document.id} className="flex items-center gap-3">
                  <Badge variant="outline">{document.type.replaceAll('_', ' ')}</Badge>
                  <a
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    href={`/api/ota/documents/${document.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
          <CardDescription>{audit.length} event(s), newest first</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events recorded.</p>
          ) : (
            <ol className="space-y-3">
              {audit.map((entry) => (
                <li key={entry.id} className="border-l-2 border-border pl-3 text-sm">
                  <div className="font-medium">{entry.action}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.actorEmail ?? 'system'} ·{' '}
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                  {entry.metadata ? (
                    <div className="mt-1 break-all text-xs text-muted-foreground">
                      {JSON.stringify(entry.metadata)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
