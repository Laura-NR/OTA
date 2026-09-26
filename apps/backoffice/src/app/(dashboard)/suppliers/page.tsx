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
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { SuppliersTable } from '@/components/suppliers-table';
import { apiFetch, getServerSession } from '@/lib/api';

const VERIFY_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function SuppliersPage() {
  const t = await getTranslations('backoffice.suppliers');
  const session = await getServerSession();
  const canVerify = session?.user.role ? VERIFY_ROLES.includes(session.user.role) : false;

  let suppliers: SupplierDto[] = [];
  let expiring: SupplierDto[] = [];
  let loadError: string | null = null;
  try {
    suppliers = await apiFetch<SupplierDto[]>('/suppliers');
    expiring = await apiFetch<SupplierDto[]>('/suppliers/expiring');
  } catch (error) {
    loadError = error instanceof Error ? error.message : t('loadError');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {expiring.length > 0 ? (
        <Alert variant="destructive">
          <p className="mb-1 font-medium">{t('expiring', { count: expiring.length })}</p>
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
                  : t('noExpiry')}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('register')}</CardTitle>
          <CardDescription>
            {t('suppliersCount', { count: suppliers.length })}
          </CardDescription>
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
