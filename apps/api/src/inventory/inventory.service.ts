import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  InventoryItem,
  InventoryMedia,
  Prisma,
  PricingRule as PrismaPricingRule,
} from '@ota/db';
import { PricingRuleKind, calculatePrice, type PricingRule } from '@ota/domain';
import type { ObjectStorage } from '@ota/storage';
import type {
  CreateInventoryItemRequest,
  CreatePricingRuleRequest,
  InventoryItemDto,
  InventoryMediaDto,
  ListInventoryQuery,
  PriceQuoteDto,
  PricingRuleDto,
  UpdateInventoryItemRequest,
  UpdatePricingRuleRequest,
  UploadInventoryMediaRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { OBJECT_STORAGE } from '../storage/storage.module';
import { PrismaService } from '../prisma/prisma.service';

type ItemWithMedia = InventoryItem & { media?: InventoryMedia[] };

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

const MEDIA_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MEDIA_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function mediaKey(itemId: string, contentType: string): string {
  const extension = MEDIA_EXTENSION[contentType] ?? 'bin';
  return `inventory/${itemId}/${randomUUID()}.${extension}`;
}

/** The DTO reports the type from the key extension, avoiding a schema column. */
function mediaContentTypeFromKey(key: string): string | null {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_CONTENT_TYPE[extension] ?? null;
}

function toMediaDto(media: InventoryMedia): InventoryMediaDto {
  return {
    id: media.id,
    inventoryItemId: media.inventoryItemId,
    altText: media.altText,
    position: media.position,
    contentType: mediaContentTypeFromKey(media.storageKey),
    createdAt: media.createdAt.toISOString(),
  };
}

function toItemDto(item: ItemWithMedia): InventoryItemDto {
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
    media: (item.media ?? []).map(toMediaDto),
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

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
      include: { media: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return items.map(toItemDto);
  }

  async getById(id: string): Promise<InventoryItemDto> {
    return toItemDto(await this.loadItemWithMedia(id));
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

    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data,
      include: { media: { orderBy: { position: 'asc' } } },
    });
    await this.audit(actor, 'inventory.updated', id);
    return toItemDto(item);
  }

  /**
   * Hard-delete a catalog item and its gallery. Pricing rules and media rows
   * cascade; the stored image objects are removed best-effort first. The action
   * is audited so the deletion is traceable after the row is gone.
   */
  async remove(id: string, actor: AuthUser): Promise<void> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!item) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }

    await Promise.all(
      item.media.map((media) =>
        this.storage.delete(media.storageKey).catch(() => undefined),
      ),
    );

    await this.prisma.inventoryItem.delete({ where: { id } });
    await this.audit(actor, 'inventory.deleted', id);
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

  async updatePricingRule(
    id: string,
    ruleId: string,
    input: UpdatePricingRuleRequest,
    actor: AuthUser,
  ): Promise<PricingRuleDto> {
    await this.loadRule(id, ruleId);

    const data: Prisma.PricingRuleUpdateInput = {};
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.label !== undefined) data.label = input.label;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.percent !== undefined) data.percent = input.percent;
    if (input.active !== undefined) data.active = input.active;

    const rule = await this.prisma.pricingRule.update({
      where: { id: ruleId },
      data,
    });
    await this.audit(actor, 'inventory.pricing_rule_updated', id);
    return toRuleDto(rule);
  }

  async deletePricingRule(id: string, ruleId: string, actor: AuthUser): Promise<void> {
    await this.loadRule(id, ruleId);
    await this.prisma.pricingRule.delete({ where: { id: ruleId } });
    await this.audit(actor, 'inventory.pricing_rule_deleted', id);
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

  async listMedia(id: string): Promise<InventoryMediaDto[]> {
    await this.loadItem(id);
    const media = await this.prisma.inventoryMedia.findMany({
      where: { inventoryItemId: id },
      orderBy: { position: 'asc' },
    });
    return media.map(toMediaDto);
  }

  /** Store a catalog image and append it to the item's gallery. */
  async addMedia(
    id: string,
    input: UploadInventoryMediaRequest,
    actor: AuthUser,
  ): Promise<InventoryMediaDto> {
    await this.loadItem(id);

    const data = Buffer.from(input.contentBase64, 'base64');
    if (data.length === 0) {
      throw new BadRequestException('Media file is empty');
    }
    if (data.length > MAX_MEDIA_BYTES) {
      throw new BadRequestException('Media file exceeds 5 MB');
    }

    const position = await this.prisma.inventoryMedia.count({
      where: { inventoryItemId: id },
    });
    const key = mediaKey(id, input.contentType);
    await this.storage.put(key, data, input.contentType);

    const media = await this.prisma.inventoryMedia.create({
      data: {
        inventoryItemId: id,
        storageKey: key,
        altText: input.altText ?? null,
        position,
      },
    });
    await this.audit(actor, 'inventory.media_added', id);
    return toMediaDto(media);
  }

  async deleteMedia(id: string, mediaId: string, actor: AuthUser): Promise<void> {
    await this.loadItem(id);
    const media = await this.prisma.inventoryMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.inventoryItemId !== id) {
      throw new NotFoundException(`Media ${mediaId} not found for this item`);
    }

    await this.storage.delete(media.storageKey).catch(() => undefined);
    await this.prisma.inventoryMedia.delete({ where: { id: mediaId } });
    await this.audit(actor, 'inventory.media_deleted', id);
  }

  /**
   * Stream a stored catalog image. The public storefront route passes
   * `onlyActive` so images of disabled items are not served to the world.
   */
  async readMedia(
    mediaId: string,
    onlyActive: boolean,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const media = await this.prisma.inventoryMedia.findUnique({
      where: { id: mediaId },
      include: { inventoryItem: { select: { active: true } } },
    });
    if (!media || (onlyActive && !media.inventoryItem.active)) {
      throw new NotFoundException(`Media ${mediaId} not found`);
    }

    const object = await this.storage.get(media.storageKey);
    if (!object) {
      throw new NotFoundException('Media object is missing from storage');
    }
    return { data: object.body, contentType: object.contentType };
  }

  private async loadItem(id: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }
    return item;
  }

  private async loadItemWithMedia(id: string): Promise<ItemWithMedia> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { media: { orderBy: { position: 'asc' } } },
    });
    if (!item) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }
    return item;
  }

  private async loadRule(itemId: string, ruleId: string): Promise<PrismaPricingRule> {
    await this.loadItem(itemId);
    const rule = await this.prisma.pricingRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.inventoryItemId !== itemId) {
      throw new NotFoundException(`Pricing rule ${ruleId} not found for this item`);
    }
    return rule;
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
