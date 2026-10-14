import {
  CREDENTIAL_EXPIRY_WINDOW_DAYS,
  SupplierCategory,
  UserRole,
  VerificationStatus,
  canAutoDispatch,
  isCredentialExpiringSoon,
} from '@ota/domain';
import type { SupplierDto, SupplierReliabilityDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  buttonClassName,
  cn,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { SupplierFilters } from '@/components/supplier-filters';
import { VerificationActions } from '@/components/verification-actions';
import { apiFetch, getServerSession } from '@/lib/api';
import { percent } from '@/lib/ops-format';

const VERIFY_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A-Suppliers' category chips, in the board's order. */
const CHIPS = [
  { key: 'all', category: null },
  { key: 'casa', category: SupplierCategory.HomestayHost },
  { key: 'driver', category: SupplierCategory.PrivateDriver },
  { key: 'guide', category: SupplierCategory.TourGuide },
  { key: 'translator', category: SupplierCategory.Translator },
] as const;
type ChipKey = (typeof CHIPS)[number]['key'];

interface Params {
  category?: string;
  province?: string;
  status?: string;
}

function hrefWith(params: Params, changes: Partial<Params>): string {
  const next = new URLSearchParams();
  const merged: Params = { ...params, ...changes };
  for (const [key, value] of Object.entries(merged)) {
    if (value && !(key === 'category' && value === 'all')) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/suppliers?${query}` : '/suppliers';
}

function daysUntil(date: string, now: Date): number {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY_MS);
}

function categoryKey(category: SupplierDto['category']): ChipKey {
  return CHIPS.find((candidate) => candidate.category === category)?.key ?? 'all';
}

/**
 * The suppliers register (A-Suppliers): the compliance list with the expiry
 * rule, category chips, province and verification filters, and each worker's
 * credential, reliability and auto-dispatch state. The credential inspector is
 * the detail page.
 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const t = await getTranslations('backoffice.suppliers');
  const locale = await getLocale();
  const session = await getServerSession();
  const canVerify = session?.user.role ? VERIFY_ROLES.includes(session.user.role) : false;

  const [suppliers, reliability] = await Promise.all([
    apiFetch<SupplierDto[]>('/suppliers').catch(() => null),
    apiFetch<SupplierReliabilityDto[]>('/quality/supplier-reliability').catch(() => []),
  ]);
  const reliabilityById = new Map(reliability.map((row) => [row.supplierId, row]));

  const chip: ChipKey =
    (CHIPS.find((candidate) => candidate.key === params.category)?.key as ChipKey) ??
    'all';
  const activeCategory =
    CHIPS.find((candidate) => candidate.key === chip)?.category ?? null;
  const status = Object.values(VerificationStatus).find(
    (candidate) => candidate === params.status,
  );
  const province = params.province || undefined;

  const now = new Date();
  const all = suppliers ?? [];
  const expiring = all.filter(
    (supplier) =>
      supplier.verificationStatus !== VerificationStatus.Rejected &&
      supplier.credentialExpiresAt !== null &&
      isCredentialExpiringSoon(new Date(supplier.credentialExpiresAt), now),
  );

  const rows = all.filter(
    (supplier) =>
      (!activeCategory || supplier.category === activeCategory) &&
      (!status || supplier.verificationStatus === status) &&
      (!province || supplier.provincesActive.includes(province)),
  );

  const chipCounts = Object.fromEntries(
    CHIPS.map((candidate) => [
      candidate.key,
      candidate.category
        ? all.filter((supplier) => supplier.category === candidate.category).length
        : all.length,
    ]),
  ) as Record<ChipKey, number>;

  const provinces = [
    ...new Set(all.flatMap((supplier) => supplier.provincesActive)),
  ].sort((a, b) => a.localeCompare(b, locale));
  const activeCount = all.filter(
    (supplier) => supplier.verificationStatus === VerificationStatus.Verified,
  ).length;
  const pendingCount = all.filter(
    (supplier) => supplier.verificationStatus === VerificationStatus.PendingAudit,
  ).length;
  const filtering = Boolean(activeCategory || status || province);

  function credential(supplier: SupplierDto) {
    if (!supplier.credentialExpiresAt) {
      return <Badge variant="outline">{t('credential.missing')}</Badge>;
    }
    const days = daysUntil(supplier.credentialExpiresAt, now);
    if (days < 0) {
      return (
        <Badge variant="destructive">
          {t('credential.expired', { days: Math.abs(days) })}
        </Badge>
      );
    }
    if (days <= CREDENTIAL_EXPIRY_WINDOW_DAYS) {
      return <Badge variant="warning">{t('credential.expiring', { days })}</Badge>;
    }
    return (
      <Badge variant="success">
        {t('credential.valid', {
          date: new Date(supplier.credentialExpiresAt).toLocaleDateString(locale),
        })}
      </Badge>
    );
  }

  function autoDispatch(supplier: SupplierDto) {
    const eligible = canAutoDispatch(
      {
        verificationStatus: supplier.verificationStatus,
        isAvailable: supplier.isAvailable,
        credentialExpiresAt: supplier.credentialExpiresAt
          ? new Date(supplier.credentialExpiresAt)
          : null,
      },
      now,
    );
    if (eligible) return <Badge variant="success">{t('auto.on')}</Badge>;
    if (
      supplier.verificationStatus === VerificationStatus.Verified &&
      supplier.credentialExpiresAt &&
      isCredentialExpiringSoon(new Date(supplier.credentialExpiresAt), now)
    ) {
      return <Badge variant="warning">{t('auto.paused')}</Badge>;
    }
    if (supplier.verificationStatus !== VerificationStatus.Verified) {
      return <Badge variant="outline">{t('auto.off')}</Badge>;
    }
    return <Badge variant="outline">{t('auto.unavailable')}</Badge>;
  }

  function reliabilityCell(supplier: SupplierDto) {
    const row = reliabilityById.get(supplier.id);
    if (!row || row.offers === 0) {
      return <span className="text-muted">{t('table.noReliability')}</span>;
    }
    const low = row.acceptanceRate < 0.85;
    return (
      <div className="flex min-w-24 flex-col gap-1">
        <span aria-hidden="true" className="block h-1.5 rounded-r-sm bg-neutral-100">
          <span
            className={cn(
              'block h-full rounded-r-sm',
              low ? 'bg-warning-500' : 'bg-primary-600',
            )}
            style={{ width: `${Math.round(row.acceptanceRate * 100)}%` }}
          />
        </span>
        <span className={cn('font-mono text-caption', low && 'text-warning-700')}>
          {percent(row.acceptanceRate, locale)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-h3">{t('title')}</h1>
          <p className="text-caption text-muted">
            {t('summary', {
              active: activeCount,
              pending: pendingCount,
              paused: expiring.length,
            })}
          </p>
        </div>
        <Link
          href="/suppliers/applications"
          className={cn(buttonClassName({ variant: 'secondary', size: 'sm' }), 'ml-auto')}
        >
          {t('recruitment')}
        </Link>
      </div>

      {suppliers === null ? (
        <Alert variant="destructive">{t('loadError')}</Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-500 bg-warning-100 px-4 py-3 text-warning-700">
            <p className="min-w-60 flex-1 text-body-sm">
              <strong>{t('rule.title')}</strong> {t('rule.body')}
            </p>
            {expiring.length > 0 ? (
              <Badge variant="warning">
                {t('rule.pausedNow', {
                  count: expiring.length,
                  names: expiring
                    .map((supplier) => supplier.fullName ?? supplier.email)
                    .join(', '),
                })}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {CHIPS.map((candidate) => {
              const on = candidate.key === chip;
              return (
                <Link
                  key={candidate.key}
                  href={hrefWith(params, {
                    category: candidate.key,
                    status: undefined,
                    province: undefined,
                  })}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-body-sm font-medium',
                    on
                      ? 'border-primary-600 bg-primary-600 text-on-primary'
                      : 'bg-surface text-secondary hover:bg-neutral-100',
                  )}
                >
                  {t(`categories.${candidate.key}`)}
                  <span className="font-mono text-caption">
                    {chipCounts[candidate.key]}
                  </span>
                </Link>
              );
            })}
            <div className="ml-auto">
              <SupplierFilters provinces={provinces} />
            </div>
          </div>

          {filtering ? (
            <div>
              <Link
                href="/suppliers"
                className="text-body-sm font-medium text-primary-600 underline-offset-4 hover:underline"
              >
                {t('filters.clear')}
              </Link>
            </div>
          ) : null}

          <section
            aria-labelledby="register-title"
            className="rounded-lg border bg-surface"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <h2 id="register-title" className="font-display text-h2-compact">
                {t('register')}
              </h2>
              <p className="text-caption text-muted">
                {t('suppliersCount', { count: rows.length })}
              </p>
            </div>

            {rows.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  title={t('empty.title')}
                  description={t('empty.hint')}
                  action={
                    filtering ? (
                      <Link
                        href="/suppliers"
                        className={buttonClassName({ variant: 'secondary' })}
                      >
                        {t('filters.clear')}
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto border-t">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('table.supplier')}</TableHead>
                      <TableHead scope="col">{t('table.credential')}</TableHead>
                      <TableHead scope="col">{t('table.reliability')}</TableHead>
                      <TableHead scope="col">{t('table.auto')}</TableHead>
                      <TableHead scope="col">{t('table.status')}</TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">{t('table.verification')}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="align-top">
                          <Link
                            href={`/suppliers/${supplier.id}`}
                            className="font-medium text-primary-600 underline-offset-4 hover:underline"
                          >
                            {supplier.fullName ?? supplier.email}
                          </Link>
                          <div className="text-caption text-muted">
                            {supplier.email} ·{' '}
                            {t(`categories.${categoryKey(supplier.category)}`)}
                          </div>
                          <div className="text-caption text-muted">
                            {supplier.provincesActive.join(', ') || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {credential(supplier)}
                        </TableCell>
                        <TableCell className="align-top">
                          {reliabilityCell(supplier)}
                        </TableCell>
                        <TableCell className="align-top">
                          {autoDispatch(supplier)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant={
                              supplier.verificationStatus === VerificationStatus.Verified
                                ? 'success'
                                : supplier.verificationStatus ===
                                      VerificationStatus.Rejected ||
                                    supplier.verificationStatus ===
                                      VerificationStatus.Suspended
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {supplier.verificationStatus.replaceAll('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <VerificationActions
                            supplierId={supplier.id}
                            status={supplier.verificationStatus}
                            canVerify={canVerify}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="border-t px-5 py-3 text-caption text-muted">
              {t('reliabilityNote')}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
