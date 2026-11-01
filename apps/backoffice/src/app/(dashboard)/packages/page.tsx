import type { InventoryItemDto, PackageDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
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
import Link from 'next/link';

import { OverrideNotice } from '@/components/override-notice';
import { deskAccess } from '@/lib/overrides';
import { PageHeader } from '@/components/page-header';
import { PackageActions } from '@/components/package-actions';
import { PackageCreateForm } from '@/components/package-create-form';
import { apiFetch, getServerSession } from '@/lib/api';

export default async function PackagesPage() {
  const t = await getTranslations('backoffice.packagesPage');
  const session = await getServerSession();
  const access = await deskAccess(session?.user.role, 'catalog');
  const canManage = access.canManage;

  const [packages, inventory] = await Promise.all([
    apiFetch<PackageDto[]>('/packages').catch(() => []),
    apiFetch<InventoryItemDto[]>('/inventory').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <OverrideNotice capability="catalog" overrides={access.overrides} />

      {canManage ? <PackageCreateForm items={inventory} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('published')}</CardTitle>
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <Alert>{t('empty')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('province')}</TableHead>
                  <TableHead>{t('days')}</TableHead>
                  <TableHead>{t('price')}</TableHead>
                  <TableHead>{t('services')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  {canManage ? (
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">
                      <Link href={`/packages/${pkg.id}`} className="hover:underline">
                        {pkg.name}
                      </Link>
                      <div className="text-caption text-muted">{pkg.slug}</div>
                    </TableCell>
                    <TableCell>{pkg.province ?? '—'}</TableCell>
                    <TableCell>{pkg.durationDays}</TableCell>
                    <TableCell>
                      {pkg.currency} {Number(pkg.basePrice).toFixed(2)}
                    </TableCell>
                    <TableCell>{pkg.services.length}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          pkg.status === 'PUBLISHED'
                            ? 'success'
                            : pkg.status === 'IN_REVIEW'
                              ? 'warning'
                              : pkg.status === 'ARCHIVED'
                                ? 'secondary'
                                : 'outline'
                        }
                      >
                        {pkg.status}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <PackageActions
                          packageId={pkg.id}
                          status={pkg.status}
                          canManage={canManage}
                        />
                      </TableCell>
                    ) : null}
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
