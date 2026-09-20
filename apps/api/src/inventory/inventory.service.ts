import { Injectable, NotFoundException } from '@nestjs/common';
import type { InventoryItem, Prisma, PricingRule as PrismaPricingRule } from '@ota/db';
import { PricingRuleKind, calculatePrice, type PricingRule } from '@ota/domain';
import type {
  CreateInventoryItemRequest,
  CreatePricingRuleRequest,
  InventoryItemDto,
  ListInventoryQuery,
  PriceQuoteDto,
  PricingRuleDto,
  UpdateInventoryItemRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

function toItemDto(item: InventoryItem): InventoryItemDto {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    description: item.description,
    province: item.province,
    currency: item.currency,
    basePrice: item.basePrice.toString(),
    active: item.active,
    supplierId: item.supplierId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toRuleDto(rule: PrismaPricingRule): PricingRuleDto {
  return {
    id: rule.id,
    inventoryItemId: rule.inventoryItemId,
    kind: rule.kind,
    label: rule.label,
    startDate: rule.startDate ? rule.startDate.toISOString() : null,
    endDate: rule.endDate ? rule.endDate.toISOString() : null,
    amount: rule.amount === null ? null : rule.amount.toString(),
    percent: rule.percent === null ? null : rule.percent.toString(),
    active: rule.active,
  };
}

function toDomainRule(rule: PrismaPricingRule): PricingRule {
  return {
    kind: rule.kind as PricingRuleKind,
    label: rule.label,
    active: rule.active,
    amount: rule.amount === null ? null : Number(rule.amount),
    percent: rule.percent === null ? null : Number(rule.percent),
    startDate: rule.startDate,
    endDate: rule.endDate,
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListInventoryQuery): Promise<InventoryItemDto[]> {
    const where: Prisma.InventoryItemWhereInput = {};
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.province) {
      where.province = filters.province;
    }
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    const items = await this.prisma.inventoryItem.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return items.map(toItemDto);
  }

  async getById(id: string): Promise<InventoryItemDto> {
    return toItemDto(await this.loadItem(id));
  }

  async create(
    input: CreateInventoryItemRequest,
    actor: AuthUser,
  ): Promise<InventoryItemDto> {
    const item = await this.prisma.inventoryItem.create({
      data: {
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        province: input.province ?? null,
        currency: input.currency,
        basePrice: input.basePrice,
        active: true,
        attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue,
        supplierId: input.supplierId ?? null,
      },
    });
    await this.audit(actor, 'inventory.created', item.id);
    return toItemDto(item);
  }

  async update(
    id: string,
    input: UpdateInventoryItemRequest,
    actor: AuthUser,
  ): Promise<InventoryItemDto> {
    await this.loadItem(id);

    const data: Prisma.InventoryItemUpdateInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.province !== undefined) data.province = input.province;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.basePrice !== undefined) data.basePrice = input.basePrice;
    if (input.active !== undefined) data.active = input.active;
    if (input.attributes !== undefined) {
      data.attributes = input.attributes as Prisma.InputJsonValue;
    }
    if (input.supplierId !== undefined) {
      data.supplier = { connect: { id: input.supplierId } };
    }

    const item = await this.prisma.inventoryItem.update({ where: { id }, data });
    await this.audit(actor, 'inventory.updated', id);
    return toItemDto(item);
  }

  async listPricingRules(id: string): Promise<PricingRuleDto[]> {
    await this.loadItem(id);
    const rules = await this.prisma.pricingRule.findMany({
      where: { inventoryItemId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rules.map(toRuleDto);
  }

  async addPricingRule(
    id: string,
    input: CreatePricingRuleRequest,
    actor: AuthUser,
  ): Promise<PricingRuleDto> {
    await this.loadItem(id);
    const rule = await this.prisma.pricingRule.create({
      data: {
        inventoryItemId: id,
        kind: input.kind,
        label: input.label,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        amount: input.amount ?? null,
        percent: input.percent ?? null,
        active: true,
      },
    });
    await this.audit(actor, 'inventory.pricing_rule_added', id);
    return toRuleDto(rule);
  }

  async priceQuote(id: string, date: Date): Promise<PriceQuoteDto> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { pricingRules: true },
    });
    if (!item) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }

    return calculatePrice(
      Number(item.basePrice),
      date,
      item.pricingRules.map(toDomainRule),
    );
  }

  private async loadItem(id: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }
    return item;
  }

  private async audit(actor: AuthUser, action: string, itemId: string): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action,
        entityType: 'InventoryItem',
        entityId: itemId,
      },
    });
  }
}
