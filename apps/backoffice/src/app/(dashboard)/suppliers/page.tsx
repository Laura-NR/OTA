import { UserRole } from '@ota/domain';
import type { SupplierDto } from '@ota/schemas';
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
import { SuppliersTable } from '@/components/suppliers-table';
import { apiFetch, getServerSession } from '@/lib/api';

const VERIFY_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function SuppliersPage() {
  const session = await getServerSession();
  const canVerify = session?.user.role ? VERIFY_ROLES.includes(session.user.role) : false;

  let suppliers: SupplierDto[] = [];
  let expiring: SupplierDto[] = [];
  let loadError: string | null = null;
  try {
    suppliers = await apiFetch<SupplierDto[]>('/suppliers');
    expiring = await apiFetch<SupplierDto[]>('/suppliers/expiring');
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load suppliers.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Worker and provider compliance. A verified, in-province supplier is eligible for dispatch."
      />

      {expiring.length > 0 ? (
        <Alert variant="destructive">
          <p className="mb-1 font-medium">
            {expiring.length} credential(s) expiring within 30 days — auto-dispatch is
            paused:
          </p>
          <ul className="list-inside list-disc space-y-1">
            {expiring.map((supplier) => (
              <li key={supplier.id}>
                <Link
                  href={`/suppliers/${supplier.id}`}
                  className="underline underline-offset-4"
                >
                  {supplier.fullName ?? supplier.email}
                </Link>{' '}
                —{' '}
                {supplier.credentialExpiresAt
                  ? new Date(supplier.credentialExpiresAt).toLocaleDateString()
                  : 'no expiry'}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Compliance register</CardTitle>
          <CardDescription>{suppliers.length} supplier(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">{loadError}</Alert>
          ) : (
            <SuppliersTable suppliers={suppliers} canVerify={canVerify} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
