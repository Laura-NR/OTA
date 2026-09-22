import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  createInventoryItemSchema,
  createPricingRuleSchema,
  listInventoryQuerySchema,
  priceQuoteQuerySchema,
  updateInventoryItemSchema,
  updatePricingRuleSchema,
  uploadInventoryMediaSchema,
  type CreateInventoryItemRequest,
  type CreatePricingRuleRequest,
  type InventoryItemDto,
  type InventoryMediaDto,
  type ListInventoryQuery,
  type PriceQuoteDto,
  type PriceQuoteQuery,
  type PricingRuleDto,
  type UpdateInventoryItemRequest,
  type UpdatePricingRuleRequest,
  type UploadInventoryMediaRequest,
} from '@ota/schemas';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { InventoryService } from './inventory.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(listInventoryQuerySchema))
    query: ListInventoryQuery,
  ): Promise<InventoryItemDto[]> {
    return this.inventory.list(query);
  }

  // Media is served through an authorised route rather than a public URL; the
  // public storefront stream lives at GET /catalog/media/:id.
  @Get('media/:mediaId')
  @Roles(...READ_ROLES)
  async media(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.inventory.readMedia(mediaId, false);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'private, max-age=60');
    response.send(Buffer.from(data));
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryItemDto> {
    return this.inventory.getById(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @Body(new ZodValidationPipe(createInventoryItemSchema))
    body: CreateInventoryItemRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<InventoryItemDto> {
    return this.inventory.create(body, actor);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInventoryItemSchema))
    body: UpdateInventoryItemRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<InventoryItemDto> {
    return this.inventory.update(id, body, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.inventory.remove(id, actor);
  }

  @Get(':id/pricing-rules')
  @Roles(...READ_ROLES)
  listPricingRules(@Param('id', ParseUUIDPipe) id: string): Promise<PricingRuleDto[]> {
    return this.inventory.listPricingRules(id);
  }

  @Post(':id/pricing-rules')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  addPricingRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPricingRuleSchema))
    body: CreatePricingRuleRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PricingRuleDto> {
    return this.inventory.addPricingRule(id, body, actor);
  }

  @Patch(':id/pricing-rules/:ruleId')
  @Roles(...WRITE_ROLES)
  updatePricingRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body(new ZodValidationPipe(updatePricingRuleSchema))
    body: UpdatePricingRuleRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PricingRuleDto> {
    return this.inventory.updatePricingRule(id, ruleId, body, actor);
  }

  @Delete(':id/pricing-rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  deletePricingRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.inventory.deletePricingRule(id, ruleId, actor);
  }

  @Get(':id/media')
  @Roles(...READ_ROLES)
  listMedia(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryMediaDto[]> {
    return this.inventory.listMedia(id);
  }

  @Post(':id/media')
  @Roles(...WRITE_ROLES)
  addMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(uploadInventoryMediaSchema))
    body: UploadInventoryMediaRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<InventoryMediaDto> {
    return this.inventory.addMedia(id, body, actor);
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  deleteMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.inventory.deleteMedia(id, mediaId, actor);
  }

  @Get(':id/price')
  @Roles(...READ_ROLES)
  priceQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(priceQuoteQuerySchema)) query: PriceQuoteQuery,
  ): Promise<PriceQuoteDto> {
    return this.inventory.priceQuote(id, query.date);
  }
}
