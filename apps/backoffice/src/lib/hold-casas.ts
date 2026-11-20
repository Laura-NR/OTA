import type { InventoryItemDto } from '@ota/schemas';

import { apiFetch } from './api';

/**
 * The stays a room can be held at for an event's concierge requests
 * (`docs/schema-m10-holds-photos.md` H1a): the catalog's active
 * accommodation, by name. Empty when the catalog cannot be read.
 */
export async function holdCasas(): Promise<{ id: string; name: string }[]> {
  const items = await apiFetch<InventoryItemDto[]>('/inventory?type=ACCOMMODATION').catch(
    () => [],
  );
  return items
    .filter((item) => item.active)
    .map((item) => ({ id: item.id, name: item.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
