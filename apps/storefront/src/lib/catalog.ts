import type { InventoryItemDto } from '@ota/schemas';

export interface CatalogFilters {
  type?: string;
  province?: string;
}

function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

/**
 * Read the public catalog, optionally filtered by type and province. Cached for
 * 60s, and tolerant of an unavailable API so a cold build or a briefly-down
 * backend still renders the page shell.
 */
export async function getCatalog(
  filters: CatalogFilters = {},
): Promise<InventoryItemDto[]> {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.province) params.set('province', filters.province);
  const query = params.toString();

  try {
    const response = await fetch(`${apiBaseUrl()}/catalog${query ? `?${query}` : ''}`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as InventoryItemDto[];
  } catch {
    return [];
  }
}
