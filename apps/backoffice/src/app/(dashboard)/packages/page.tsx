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
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { PackageActions } from '@/components/package-actions';
import { PackageCreateForm } from '@/components/package-create-form';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function PackagesPage() {
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  const [packages, inventory] = await Promise.all([
    apiFetch<PackageDto[]>('/packages').catch(() => []),
    apiFetch<InventoryItemDto[]>('/inventory').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Curated packages"
        description="Multi-day templates built from catalog items (spec §3.3). Booking a package expands it into a reservation's service items."
      />

      {canManage ? <PackageCreateForm items={inventory} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Published packages</CardTitle>
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <Alert>No curated packages yet.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? (
                    <TableHead className="text-right">Actions</TableHead>
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
                        {pkg.active ? 'Active' : 'Inactive'}
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
