import {
  SupplierCategory,
  UserRole,
  VerificationStatus,
  canAutoDispatch,
  isCredentialExpiringSoon,
  meetsReliabilityFloor,
} from '@ota/domain';
import type { SupplierDetailDto, SupplierReliabilityDto } from '@ota/schemas';
import { Badge, buttonClassName, cn } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { AvailabilityCalendar } from '@/components/availability-calendar';
import { SupplierCredential } from '@/components/supplier-credential';
import { SupplierResourcesForm } from '@/components/supplier-resources-form';
import { SupplierVehicleForm } from '@/components/supplier-vehicle-form';
import { VerificationActions } from '@/components/verification-actions';
import { getThresholds } from '@/lib/operating';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { opsDate, opsTime, percent } from '@/lib/ops-format';
import { lastJobLabel } from '@/lib/suppliers';

const VERIFY_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];
const EDIT_ROLES: readonly string[] = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
];

const DAY_MS = 24 * 60 * 60 * 1000;

type ExpiryBadge = {
  label: string;
  variant: 'success' | 'destructive' | 'warning' | 'outline';
};

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-surface px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h4">{title}</h2>
        {description ? <p className="text-caption text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The supplier inspector (A-Suppliers): the worker's profile, the credential
 * inspector (spec §4.5), the auto-dispatch state, reliability and job history,
 * a casa's backup power or a driver's vehicle and fuel reserve (M6), and the
 * availability calendar. Guide specialities wait (M6 D7), payouts for the
 * payments module.
 */
export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('backoffice.supplierDetail');
  const serviceTypeT = await getTranslations('status.serviceType');
  const locale = await getLocale();
  const session = await getServerSession();
  const role = session?.user.role ?? '';
  const canVerify = VERIFY_ROLES.includes(role);
  const canEdit = EDIT_ROLES.includes(role);

  const supplier = await apiFetch<SupplierDetailDto>(`/suppliers/${id}`).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    },
  );
  const reliability = await apiFetch<SupplierReliabilityDto[]>(
    '/quality/supplier-reliability',
  )
    .then((rows) => rows.find((row) => row.supplierId === id) ?? null)
    .catch(() => null);

  const now = new Date();
  const thresholds = await getThresholds();
  const windowDays = thresholds.credentialExpiryWindowDays;
  const expiresAt = supplier.credentialExpiresAt;
  const expiryDays = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS)
    : null;
  const expiry: ExpiryBadge = !expiresAt
    ? { label: t('noExpiry'), variant: 'outline' }
    : expiryDays! < 0
      ? { label: t('expired', { days: Math.abs(expiryDays!) }), variant: 'destructive' }
      : expiryDays! <= windowDays
        ? { label: t('expiresIn', { days: expiryDays! }), variant: 'warning' }
        : { label: new Date(expiresAt).toLocaleDateString(locale), variant: 'success' };

  const eligible = canAutoDispatch(
    {
      verificationStatus: supplier.verificationStatus,
      isAvailable: supplier.isAvailable,
      credentialExpiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    now,
    windowDays,
  );
  const paused =
    supplier.verificationStatus === VerificationStatus.Verified &&
    expiresAt !== null &&
    isCredentialExpiringSoon(new Date(expiresAt), now, windowDays);
  const auto =
    eligible &&
    !meetsReliabilityFloor(
      reliability,
      thresholds.reliabilityFloorPercent / 100,
      thresholds.reliabilityMinAnswered,
    )
      ? {
          label: t('autoReliability'),
          variant: 'warning' as const,
          why: t('autoWhyReliability', {
            floor: thresholds.reliabilityFloorPercent,
            min: thresholds.reliabilityMinAnswered,
          }),
        }
      : eligible
        ? {
            label: t('autoOn'),
            variant: 'success' as const,
            why: t('autoWhyOn', { days: windowDays }),
          }
        : paused
          ? {
              label: t('autoPaused'),
              variant: 'warning' as const,
              why: t('autoWhyPaused', { days: windowDays }),
            }
          : supplier.verificationStatus !== VerificationStatus.Verified
            ? { label: t('autoOff'), variant: 'outline' as const, why: t('autoWhyOff') }
            : {
                label: t('autoUnavailable'),
                variant: 'outline' as const,
                why: t('autoWhyUnavailable'),
              };

  const phone = supplier.primaryPhone.replace(/[^+\d]/g, '');
  const resourcesKind =
    supplier.category === SupplierCategory.HomestayHost
      ? 'casa'
      : supplier.category === SupplierCategory.PrivateDriver
        ? 'driver'
        : null;
  const resources = supplier.resources;
  // The insurance date is informational (M6 D7(b)): it never pauses dispatch.
  const insuranceDays = supplier.vehicle?.insuranceUntil
    ? Math.ceil(
        (new Date(supplier.vehicle.insuranceUntil).getTime() - now.getTime()) / DAY_MS,
      )
    : null;
  const insurance: ExpiryBadge | null =
    insuranceDays === null
      ? null
      : insuranceDays < 0
        ? { label: t('vehicle.insuranceExpired'), variant: 'destructive' }
        : insuranceDays <= windowDays
          ? {
              label: t('vehicle.insuranceEnds', { days: insuranceDays }),
              variant: 'warning',
            }
          : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/suppliers" className="text-body-sm text-muted hover:text-default">
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-h3">
                {supplier.fullName ?? supplier.email}
              </h1>
              <Badge
                variant={
                  supplier.verificationStatus === VerificationStatus.Verified
                    ? 'success'
                    : supplier.verificationStatus === VerificationStatus.Rejected ||
                        supplier.verificationStatus === VerificationStatus.Suspended
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {supplier.verificationStatus.replaceAll('_', ' ')}
              </Badge>
            </div>
            <p className="text-caption text-muted">
              {supplier.category.replaceAll('_', ' ')} ·{' '}
              {supplier.provincesActive.join(', ') || '—'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`tel:${phone}`}
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              {supplier.primaryPhone}
            </a>
            <a
              href={`https://wa.me/${phone.replace(/^\+/, '')}`}
              target="_blank"
              rel="noreferrer"
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              WhatsApp
            </a>
            <a
              href={`mailto:${supplier.email}`}
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              {supplier.email}
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('profile')} description={supplier.category.replaceAll('_', ' ')}>
          <dl className="grid grid-cols-2 gap-4 text-body-sm">
            <div>
              <dt className="text-caption uppercase text-muted">{t('provinces')}</dt>
              <dd className="mt-1">{supplier.provincesActive.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase text-muted">{t('rtnLicence')}</dt>
              <dd className="mt-1 font-mono">{supplier.rtnLicenseNumber}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase text-muted">
                {t('credentialExpiry')}
              </dt>
              <dd className="mt-1">
                <Badge variant={expiry.variant}>{expiry.label}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-caption uppercase text-muted">{t('dispatchLabel')}</dt>
              <dd className="mt-1">{supplier.isAvailable ? t('yes') : t('no')}</dd>
            </div>
          </dl>
          <VerificationActions
            supplierId={supplier.id}
            status={supplier.verificationStatus}
            canVerify={canVerify}
          />
        </Panel>

        <Panel title={t('autoTitle')}>
          <Badge variant={auto.variant} className="self-start">
            {auto.label}
          </Badge>
          <p className="text-body-sm text-secondary">{auto.why}</p>
        </Panel>
      </div>

      <Panel title={t('reliabilityTitle')} description={t('reliabilityDescription')}>
        {!reliability || reliability.offers === 0 ? (
          <p className="text-body-sm text-muted">{t('noReliability')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label={t('accepted')} value={String(reliability.accepted)} />
            <Stat label={t('declined')} value={String(reliability.declined)} />
            <Stat label={t('timedOut')} value={String(reliability.timedOut)} />
            <Stat
              label={t('response')}
              value={t('minutes', { minutes: reliability.averageResponseMinutes })}
            />
            <Stat
              label={t('acceptance')}
              value={percent(reliability.acceptanceRate, locale)}
            />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          <Stat label={t('jobs12m')} value={String(supplier.jobs12m)} />
          <Stat
            mono={false}
            label={t('lastJob')}
            value={
              supplier.lastJob
                ? lastJobLabel(supplier.lastJob, locale, serviceTypeT)
                : t('noJob')
            }
          />
        </div>
      </Panel>

      {resourcesKind ? (
        <Panel
          title={t(`resources.${resourcesKind}Title`)}
          description={t(`resources.${resourcesKind}Description`)}
        >
          {resourcesKind === 'driver' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-body font-semibold">{t('vehicle.title')}</h3>
                {insurance ? (
                  <Badge variant={insurance.variant}>{insurance.label}</Badge>
                ) : null}
              </div>
              <SupplierVehicleForm
                key={JSON.stringify(supplier.vehicle)}
                supplierId={supplier.id}
                vehicle={supplier.vehicle}
                canEdit={canVerify}
              />
              <h3 className="border-t pt-4 text-body font-semibold">
                {t('vehicle.fuelTitle')}
              </h3>
            </>
          ) : null}
          <SupplierResourcesForm
            key={resources?.confirmedAt ?? 'never'}
            supplierId={supplier.id}
            kind={resourcesKind}
            resources={resources}
            confirmedWhen={
              resources
                ? `${opsDate(resources.confirmedAt, locale)} ${opsTime(resources.confirmedAt, locale)}`
                : null
            }
            staleDays={thresholds.resourcesStaleDays}
            canEdit={canVerify}
          />
        </Panel>
      ) : null}

      <Panel title={t('credentialDocument')} description={t('credentialDescription')}>
        <SupplierCredential
          supplierId={supplier.id}
          hasCredential={supplier.hasCredential}
          contentType={supplier.credentialContentType}
          canEdit={canEdit}
        />
      </Panel>

      <Panel title={t('availability')} description={t('availabilityDescription')}>
        <AvailabilityCalendar supplierId={supplier.id} canEdit={canVerify} />
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  /** Figures are set in mono; a sentence such as the last job is not. */
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-neutral-50 px-3 py-2">
      <span className="text-caption text-muted">{label}</span>
      <span className={cn('text-body', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
