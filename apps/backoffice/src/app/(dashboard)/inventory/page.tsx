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
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { InventoryActions } from '@/components/inventory-actions';
import { InventoryCreateForm } from '@/components/inventory-create-form';
import { PageHeader } from '@/components/page-header';
import { PriceQuote } from '@/components/price-quote';
import { apiFetch, getServerSession } from '@/lib/api';

const WRITE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function InventoryPage() {
  const t = await getTranslations('backoffice.inventory');
  const session = await getServerSession();
  const canWrite = session?.user.role ? WRITE_ROLES.includes(session.user.role) : false;

  let items: InventoryItemDto[] = [];
  let loadError: string | null = null;
  try {
    items = await apiFetch<InventoryItemDto[]>('/inventory');
  } catch (error) {
    loadError = error instanceof Error ? error.message : t('loadError');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('addItem')}</CardTitle>
            <CardDescription>{t('addItemDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <InventoryCreateForm />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('catalog')}</CardTitle>
          <CardDescription>{t('itemsCount', { count: items.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Alert variant="destructive">{loadError}</Alert>
          ) : items.length === 0 ? (
            <Alert>{t('empty')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('image')}</TableHead>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('type')}</TableHead>
                  <TableHead>{t('province')}</TableHead>
                  <TableHead>{t('base')}</TableHead>
                  <TableHead>{t('active')}</TableHead>
                  <TableHead>{t('priceQuote')}</TableHead>
                  {canWrite ? <TableHead>{t('actions')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.media[0] ? (
                        <img
                          src={`/api/ota/inventory/media/${item.media[0].id}`}
                          alt={item.media[0].altText ?? item.name}
                          className="h-10 w-16 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-16 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/inventory/${item.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell>{item.type.replaceAll('_', ' ')}</TableCell>
                    <TableCell>{item.province ?? '—'}</TableCell>
                    <TableCell>
                      {item.currency} {Number(item.basePrice).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.active ? 'success' : 'outline'}>
                        {item.active ? t('activeLabel') : t('inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PriceQuote inventoryItemId={item.id} />
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        <InventoryActions inventoryItemId={item.id} name={item.name} />
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
