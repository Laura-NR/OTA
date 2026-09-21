import { UserRole } from '@ota/domain';
import type { InventoryItemDto } from '@ota/schemas';
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

import { InventoryCreateForm } from '@/components/inventory-create-form';
import { PageHeader } from '@/components/page-header';
import { PriceQuote } from '@/components/price-quote';
import { apiFetch, getServerSession } from '@/lib/api';

const WRITE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function InventoryPage() {
  const session = await getServerSession();
  const canWrite = session?.user.role ? WRITE_ROLES.includes(session.user.role) : false;

  let items: InventoryItemDto[] = [];
  let loadError: string | null = null;
  try {
    items = await apiFetch<InventoryItemDto[]>('/inventory');
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Could not load inventory.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Catalog and pricing. Seasonal rates and markups feed the pure domain pricing engine."
      />

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Add catalog item</CardTitle>
            <CardDescription>Accommodation, transport, or experience.</CardDescription>
          </CardHeader>
          <CardContent>
            <InventoryCreateForm />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>{items.length} item(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">{loadError}</Alert>
          ) : items.length === 0 ? (
            <Alert>No catalog items yet. Add one above or commit a bulk import.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Price quote</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.type.replaceAll('_', ' ')}</TableCell>
                    <TableCell>{item.province ?? '—'}</TableCell>
                    <TableCell>
                      {item.currency} {Number(item.basePrice).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.active ? 'success' : 'outline'}>
                        {item.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PriceQuote inventoryItemId={item.id} />
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
