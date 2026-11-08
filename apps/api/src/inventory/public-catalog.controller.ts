import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import {
  listCatalogQuerySchema,
  type CatalogItemDto,
  type ListCatalogQuery,
} from '@ota/schemas';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { InventoryService } from './inventory.service';

/**
 * The storefront's read-only catalog. Deliberately `@Public()` and hard-wired
 * to active items only, and without the supplier link — the operations
 * `GET /inventory` view stays authenticated. Supports type/province filters
 * (spec §4.6 storefront control).
 */
@Controller('catalog')
export class PublicCatalogController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Public()
  list(
    @Query(new ZodValidationPipe(listCatalogQuerySchema)) query: ListCatalogQuery,
  ): Promise<CatalogItemDto[]> {
    return this.inventory.listCatalog(query);
  }

  // Images of inactive items must not be world-readable, so the public stream
  // refuses them; the back-office preview uses GET /inventory/media/:id.
  @Get('media/:mediaId')
  @Public()
  async media(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.inventory.readMedia(mediaId, true);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'public, max-age=300');
    response.send(Buffer.from(data));
  }
}
