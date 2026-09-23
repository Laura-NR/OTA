import type { InventoryItemDto, PackageDto } from '@ota/schemas';
import { notFound } from 'next/navigation';

import { PackageEditForm } from '@/components/package-edit-form';
import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/errors';

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [pkg, items] = await Promise.all([
    apiFetch<PackageDto>(`/packages/${id}`).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    }),
    apiFetch<InventoryItemDto[]>('/inventory').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={pkg.name}
        description={`${pkg.slug} · ${pkg.durationDays} days · ${pkg.currency} ${Number(
          pkg.basePrice,
        ).toFixed(2)}`}
      />
      <PackageEditForm package={pkg} items={items} />
    </div>
  );
}
