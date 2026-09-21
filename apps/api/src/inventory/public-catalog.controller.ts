import { Controller, Get } from '@nestjs/common';
import type { InventoryItemDto } from '@ota/schemas';

import { Public } from '../auth/public.decorator';
import { InventoryService } from './inventory.service';

/**
 * The storefront's read-only catalog. Deliberately `@Public()` and hard-wired
 * to active items only — the operations `GET /inventory` view stays
 * authenticated.
 */
@Controller('catalog')
export class PublicCatalogController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Public()
  list(): Promise<InventoryItemDto[]> {
    return this.inventory.list({ active: true });
  }
}
