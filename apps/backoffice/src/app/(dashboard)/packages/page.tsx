import { UserRole } from '@ota/domain';
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

import { PageHeader } from '@/components/page-header';
import { PackageActions } from '@/components/package-actions';
import { PackageCreateForm } from '@/components/package-create-form';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function PackagesPage() {
  const t = await getTranslations('backoffice.packagesPage');
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  const [packages, inventory] = await Promise.all([
    apiFetch<PackageDto[]>('/packages').catch(() => []),
    apiFetch<InventoryItemDto[]>('/inventory').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

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
                      <div className="text-xs text-muted-foreground">{pkg.slug}</div>
                    </TableCell>
                    <TableCell>{pkg.province ?? '—'}</TableCell>
                    <TableCell>{pkg.durationDays}</TableCell>
                    <TableCell>
                      {pkg.currency} {Number(pkg.basePrice).toFixed(2)}
                    </TableCell>
                    <TableCell>{pkg.services.length}</TableCell>
                    <TableCell>
                      <Badge variant={pkg.active ? 'default' : 'outline'}>
                        {pkg.active ? t('active') : t('inactive')}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <PackageActions
                          packageId={pkg.id}
                          active={pkg.active}
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
