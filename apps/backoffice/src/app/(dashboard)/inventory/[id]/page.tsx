import { UserRole } from '@ota/domain';
import type { InventoryItemDto, PricingRuleDto } from '@ota/schemas';
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

import { InventoryEditForm } from '@/components/inventory-edit-form';
import { InventoryMediaManager } from '@/components/inventory-media-manager';
import { PriceQuote } from '@/components/price-quote';
import { PricingRulesManager } from '@/components/pricing-rules-manager';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';

const WRITE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  const canWrite = session?.user.role ? WRITE_ROLES.includes(session.user.role) : false;

  const item = await apiFetch<InventoryItemDto>(`/inventory/${id}`).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    },
  );
  const rules = await apiFetch<PricingRuleDto[]>(`/inventory/${id}/pricing-rules`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/inventory"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Inventory
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
        <Badge variant="secondary">{item.type.replaceAll('_', ' ')}</Badge>
        <Badge variant={item.active ? 'success' : 'outline'}>
          {item.active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {item.currency} {Number(item.basePrice).toFixed(2)} base ·{' '}
            {item.province ?? 'province unset'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canWrite ? (
            <InventoryEditForm item={item} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {item.description ?? 'No description.'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            Shown on the public catalog. Images of inactive items are not served.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InventoryMediaManager inventoryItemId={item.id} media={item.media} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing rules</CardTitle>
          <CardDescription>
            Seasonal rates override the base price; markups stack on top.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canWrite ? (
            <PricingRulesManager inventoryItemId={item.id} rules={rules} />
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pricing rules; the base price applies year-round.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {rules.map((rule) => (
                <li key={rule.id}>
                  {rule.label} — {rule.kind.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t pt-4">
            <PriceQuote inventoryItemId={item.id} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
