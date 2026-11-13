import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import {
  listPackagesQuerySchema,
  type ListPackagesQuery,
  type PackageDto,
} from '@ota/schemas';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PackagesService } from './packages.service';

/**
 * The storefront's public package catalogue. `@Public()` and hard-wired to
 * published packages only; the operations `GET /packages` view stays
 * authenticated.
 */
@Controller('catalog/packages')
export class PublicPackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  @Public()
  list(
    @Query(new ZodValidationPipe(listPackagesQuerySchema))
    query: ListPackagesQuery,
  ): Promise<PackageDto[]> {
    return this.packages.listPublic(query);
  }

  // Photos of a draft package must not be world-readable, so the public stream
  // refuses them; the back-office preview uses GET /packages/media/:id.
  @Get('media/:mediaId')
  @Public()
  async media(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.packages.readMedia(mediaId, true);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'public, max-age=300');
    response.send(Buffer.from(data));
  }

  @Get(':slug')
  @Public()
  getBySlug(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
  ): Promise<PackageDto> {
    return this.packages.getBySlug(slug, locale);
  }
}
