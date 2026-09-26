import type { InventoryItemDto, PackageDto } from '@ota/schemas';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('backoffice.packageDetail');

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
        description={t('subtitle', {
          slug: pkg.slug,
          days: pkg.durationDays,
          currency: pkg.currency,
          price: Number(pkg.basePrice).toFixed(2),
        })}
      />
      <PackageEditForm package={pkg} items={items} />
    </div>
  );
}
