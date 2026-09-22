import { redirect } from 'next/navigation';

import { PackageBuilder } from '@/components/package-builder';
import { getServerSession } from '@/lib/api';
import { getCatalog } from '@/lib/catalog';

export default async function BuildPage() {
  const session = await getServerSession();
  if (!session) {
    redirect('/login?next=/build');
  }

  const items = await getCatalog();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Build your itinerary</h1>
      <p className="mt-2 text-muted-foreground">
        Pick your dates and the stays, transport, and experiences you want. We will
        assemble the itinerary and start securing providers.
      </p>
      <div className="mt-6">
        <PackageBuilder items={items} />
      </div>
    </div>
  );
}
