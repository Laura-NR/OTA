import { UserRole } from '@ota/domain';
import type { SupplierDto } from '@ota/schemas';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SupplierCredential } from '@/components/supplier-credential';
import { VerificationActions } from '@/components/verification-actions';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';

const VERIFY_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];
const EDIT_ROLES: readonly string[] = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
];

type ExpiryBadge = { label: string; variant: 'success' | 'destructive' | 'outline' };

function expiryBadge(expiresAt: string | null): ExpiryBadge {
  if (!expiresAt) {
    return { label: 'No expiry tracked', variant: 'outline' };
  }
  const days = Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  if (days < 0) {
    return { label: `Expired ${Math.abs(days)}d ago`, variant: 'destructive' };
  }
  if (days <= 30) {
    return { label: `Expires in ${days}d`, variant: 'destructive' };
  }
  return { label: new Date(expiresAt).toLocaleDateString(), variant: 'success' };
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  const role = session?.user.role ?? '';
  const canVerify = VERIFY_ROLES.includes(role);
  const canEdit = EDIT_ROLES.includes(role);

  const supplier = await apiFetch<SupplierDto>(`/suppliers/${id}`).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    },
  );

  const expiry = expiryBadge(supplier.credentialExpiresAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/suppliers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Suppliers
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {supplier.fullName ?? supplier.email}
        </h1>
        <Badge variant="secondary">
          {supplier.verificationStatus.replaceAll('_', ' ')}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compliance profile</CardTitle>
          <CardDescription>{supplier.category.replaceAll('_', ' ')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Contact
              </dt>
              <dd className="mt-1 text-sm">{supplier.email}</dd>
              <dd className="text-xs text-muted-foreground">{supplier.primaryPhone}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Provinces
              </dt>
              <dd className="mt-1 text-sm">
                {supplier.provincesActive.join(', ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                RTN licence
              </dt>
              <dd className="mt-1 text-sm">{supplier.rtnLicenseNumber}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Credential expiry
              </dt>
              <dd className="mt-1">
                <Badge variant={expiry.variant}>{expiry.label}</Badge>
              </dd>
            </div>
          </dl>

          <div className="text-sm text-muted-foreground">
            Available for dispatch: {supplier.isAvailable ? 'yes' : 'no'}
          </div>

          <VerificationActions
            supplierId={supplier.id}
            status={supplier.verificationStatus}
            canVerify={canVerify}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credential document</CardTitle>
          <CardDescription>
            Formatur credential, transport operating licence, or RTN card.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupplierCredential
            supplierId={supplier.id}
            hasCredential={supplier.hasCredential}
            contentType={supplier.credentialContentType}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
