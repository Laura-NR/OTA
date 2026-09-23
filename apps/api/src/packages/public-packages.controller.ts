import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  listPackagesQuerySchema,
  type ListPackagesQuery,
  type PackageDto,
} from '@ota/schemas';

import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PackagesService } from './packages.service';

/**
 * The storefront's public package catalogue. `@Public()` and hard-wired to
 * active packages only; the operations `GET /packages` view stays
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

  @Get(':slug')
  @Public()
  getBySlug(@Param('slug') slug: string): Promise<PackageDto> {
    return this.packages.getBySlug(slug);
  }
}
