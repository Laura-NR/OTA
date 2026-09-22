import { UserRole } from '@ota/domain';
import type { SupplierApplicationDto } from '@ota/schemas';
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

import { ApplicationActions } from '@/components/application-actions';
import { PageHeader } from '@/components/page-header';
import { apiFetch, getServerSession } from '@/lib/api';

const WRITE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

function statusVariant(status: string) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  return 'secondary' as const;
}

export default async function ApplicationsPage() {
  const session = await getServerSession();
  const canReview = session?.user.role ? WRITE_ROLES.includes(session.user.role) : false;

  let applications: SupplierApplicationDto[] = [];
  let loadError: string | null = null;
  try {
    applications = await apiFetch<SupplierApplicationDto[]>('/supplier-applications');
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load applications.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Supplier recruitment. Approving an application creates the worker account and compliance profile."
      />

      <Card>
        <CardHeader>
          <CardTitle>Recruitment</CardTitle>
          <CardDescription>{applications.length} application(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">{loadError}</Alert>
          ) : applications.length === 0 ? (
            <Alert>
              No applications yet. The public form lives at /join-our-network.
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Provinces</TableHead>
                  <TableHead>RTN licence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <div className="font-medium">{application.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {application.email} · {application.phone}
                      </div>
                    </TableCell>
                    <TableCell>{application.category.replaceAll('_', ' ')}</TableCell>
                    <TableCell>{application.provincesActive.join(', ')}</TableCell>
                    <TableCell>{application.rtnLicenseNumber}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(application.status)}>
                        {application.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ApplicationActions
                        applicationId={application.id}
                        status={application.status}
                        canReview={canReview}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
