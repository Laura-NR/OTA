import { getTranslations } from 'next-intl/server';

/**
 * Read one page's content from the tenant's messages (`content.<key>`) and
 * validate it with its `@ota/schemas` schema, so a malformed tenant file fails
 * loudly instead of rendering half a page. Returns null when the tenant has no
 * such page, which the page turns into a 404.
 */
export async function getPageContent<T>(
  key: string,
  schema: { parse: (value: unknown) => T },
): Promise<T | null> {
  const t = await getTranslations('content');
  if (!t.has(key)) {
    return null;
  }
  return schema.parse(t.raw(key));
}
