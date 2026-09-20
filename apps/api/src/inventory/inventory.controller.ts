import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  createInventoryItemSchema,
  createPricingRuleSchema,
  listInventoryQuerySchema,
  priceQuoteQuerySchema,
  updateInventoryItemSchema,
  type CreateInventoryItemRequest,
  type CreatePricingRuleRequest,
  type InventoryItemDto,
  type ListInventoryQuery,
  type PriceQuoteDto,
  type PriceQuoteQuery,
  type PricingRuleDto,
  type UpdateInventoryItemRequest,
} from '@ota/schemas';

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

  @Get(':id/price')
  @Roles(...READ_ROLES)
  priceQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(priceQuoteQuerySchema)) query: PriceQuoteQuery,
  ): Promise<PriceQuoteDto> {
    return this.inventory.priceQuote(id, query.date);
  }
}
