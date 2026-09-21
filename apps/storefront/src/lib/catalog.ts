import type { InventoryItemDto } from '@ota/schemas';

function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

/**
 * Read the public catalog. Cached for 60s, and tolerant of an unavailable API
 * so a cold build or a briefly-down backend still renders the page shell.
 */
export async function getCatalog(): Promise<InventoryItemDto[]> {
  try {
    const response = await fetch(`${apiBaseUrl()}/catalog`, {
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
