import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';

import { getCatalog } from '@/lib/catalog';

export default async function CatalogPage() {
  const items = await getCatalog();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Experiences</h1>
      <p className="mt-2 text-muted-foreground">
        {items.length} curated option(s) across Cuba.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          The catalog is empty right now. Please check back soon.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle className="text-base">{item.name}</CardTitle>
                <CardDescription>
                  {item.province ?? 'Cuba'} · {item.type.replaceAll('_', ' ')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {item.description ? (
                  <p className="mb-3 text-sm text-muted-foreground">{item.description}</p>
                ) : null}
                <p className="text-sm font-medium">
                  {item.currency} {Number(item.basePrice).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
