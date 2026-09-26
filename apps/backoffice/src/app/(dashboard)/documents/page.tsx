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
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations('backoffice.documents');
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
    loadError = error instanceof Error ? error.message : t('loadError');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

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
            <CardTitle>{t('generated')}</CardTitle>
            <CardDescription>
              {t('documentsCount', { count: documents.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RegenerateDocumentsButton
              reservationId={reservation}
              canManage={canManage}
            />

            {documents.length === 0 ? (
              <Alert>{t('empty')}</Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('type')}</TableHead>
                    <TableHead>{t('generatedAt')}</TableHead>
                    <TableHead>{t('download')}</TableHead>
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
                          {t('downloadPdf')}
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
