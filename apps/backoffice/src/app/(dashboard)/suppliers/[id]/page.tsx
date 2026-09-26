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
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AvailabilityCalendar } from '@/components/availability-calendar';
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

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('backoffice.supplierDetail');
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

  const expiresAt = supplier.credentialExpiresAt;
  const expiryDays = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  const expiry: ExpiryBadge = !expiresAt
    ? { label: t('noExpiry'), variant: 'outline' }
    : expiryDays! < 0
      ? { label: t('expired', { days: Math.abs(expiryDays!) }), variant: 'destructive' }
      : expiryDays! <= 30
        ? { label: t('expiresIn', { days: expiryDays! }), variant: 'destructive' }
        : { label: new Date(expiresAt).toLocaleDateString(), variant: 'success' };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/suppliers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('back')}
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
          <CardTitle>{t('profile')}</CardTitle>
          <CardDescription>{supplier.category.replaceAll('_', ' ')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('contact')}
              </dt>
              <dd className="mt-1 text-sm">{supplier.email}</dd>
              <dd className="text-xs text-muted-foreground">{supplier.primaryPhone}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('provinces')}
              </dt>
              <dd className="mt-1 text-sm">
                {supplier.provincesActive.join(', ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('rtnLicence')}
              </dt>
              <dd className="mt-1 text-sm">{supplier.rtnLicenseNumber}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('credentialExpiry')}
              </dt>
              <dd className="mt-1">
                <Badge variant={expiry.variant}>{expiry.label}</Badge>
              </dd>
            </div>
          </dl>

          <div className="text-sm text-muted-foreground">
            {t('available', { value: supplier.isAvailable ? t('yes') : t('no') })}
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
          <CardTitle>{t('credentialDocument')}</CardTitle>
          <CardDescription>{t('credentialDescription')}</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>{t('availability')}</CardTitle>
          <CardDescription>{t('availabilityDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityCalendar supplierId={supplier.id} canEdit={canVerify} />
        </CardContent>
      </Card>
    </div>
  );
}
