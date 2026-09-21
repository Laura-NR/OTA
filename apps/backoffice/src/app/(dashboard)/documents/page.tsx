import { UserRole } from '@ota/domain';
import type { DocumentDto, ReservationDto } from '@ota/schemas';
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

import { RegenerateDocumentsButton } from '@/components/documents-controls';
import { PageHeader } from '@/components/page-header';
import { ReservationPicker } from '@/components/reservation-picker';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string }>;
}) {
  const { reservation } = await searchParams;
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  let reservations: ReservationDto[] = [];
  let documents: DocumentDto[] = [];
  let loadError: string | null = null;

  try {
    reservations = await apiFetch<ReservationDto[]>('/reservations');
    if (reservation) {
      documents = await apiFetch<DocumentDto[]>(`/reservations/${reservation}/documents`);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load documents.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Vouchers, work orders, and invoices generated from the tenant-branded templates."
      />

      <ReservationPicker
        id="documents-reservation"
        action="/documents"
        reservations={reservations}
        selectedId={reservation}
      />

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}

      {reservation ? (
        <Card>
          <CardHeader>
            <CardTitle>Generated documents</CardTitle>
            <CardDescription>{documents.length} document(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RegenerateDocumentsButton
              reservationId={reservation}
              canManage={canManage}
            />

            {documents.length === 0 ? (
              <Alert>
                No documents yet. Confirming a reservation generates them, or use
                regenerate.
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Generated</TableHead>
                    <TableHead>Download</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell>
                        <Badge variant="secondary">
                          {document.type.replaceAll('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(document.generatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <a
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                          href={`/api/ota/documents/${document.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download PDF
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
