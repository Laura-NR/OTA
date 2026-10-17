import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { knownPolicyKeys, type TenantConfig } from '@ota/config';
import { packagePublishIssues, type PackagePublishInput } from '@ota/domain';
import type {
  InventoryItem,
  InventoryMedia,
  Package,
  PackageDay,
  PackageDeparture,
  PackageExtra,
  PackageMedia,
  PackageService,
  PackageTier,
  PackageTranslation,
  Prisma,
} from '@ota/db';
import type {
  CreatePackageRequest,
  ListPackagesQuery,
  PackageDto,
  PackageMediaDto,
  PackageMediaUploadRequest,
  PutPackageTranslationRequest,
  UpdatePackageRequest,
} from '@ota/schemas';
import type { ObjectStorage } from '@ota/storage';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE } from '../storage/storage.module';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

type ServiceWithItem = PackageService & {
  inventoryItem: InventoryItem & { media: InventoryMedia[] };
};
type PackageWithServices = Package & {
  services: ServiceWithItem[];
  days: PackageDay[];
  tiers: PackageTier[];
  departures: PackageDeparture[];
  extras: PackageExtra[];
  media: PackageMedia[];
  translations: PackageTranslation[];
};

/** Lower-case kebab slug for storefront URLs (accents stripped). */
function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'package'
  );
}

/**
 * Refuse a package that fails the M1 publish checks (409 with the reasons), so
 * no client can publish what the editor would refuse. Its policy keys must be
 * ones the tenant manifest defines (M4 D2).
 */
function assertPublishable(input: PackagePublishInput): void {
  const issues = packagePublishIssues(input);
  if (issues.length > 0) {
    throw new ConflictException({
      error: 'PackageNotPublishable',
      message: `The package cannot be published: ${issues.join(', ')}`,
      issues,
    });
  }
}

function toPackageDto(pkg: PackageWithServices): PackageDto {
  return {
    id: pkg.id,
    name: pkg.name,
    slug: pkg.slug,
    description: pkg.description,
    summary: pkg.summary,
    province: pkg.province,
    durationDays: pkg.durationDays,
    currency: pkg.currency,
    basePrice: pkg.basePrice.toString(),
    status: pkg.status,
    publishedAt: pkg.publishedAt ? pkg.publishedAt.toISOString() : null,
    sourceLocale: pkg.sourceLocale,
    contentUpdatedAt: pkg.contentUpdatedAt.toISOString(),
    bookingModel: pkg.bookingModel,
    groupMin: pkg.groupMin,
    groupMax: pkg.groupMax,
    leadTimeDays: pkg.leadTimeDays,
    tourismCategory: pkg.tourismCategory,
    themes: pkg.themes,
    difficulty: pkg.difficulty,
    accessibility: pkg.accessibility,
    cancellationPolicy: pkg.cancellationPolicy,
    depositPolicy: pkg.depositPolicy,
    included: pkg.included,
    excluded: pkg.excluded,
    cubaNotes: pkg.cubaNotes,
    seoTitle: pkg.seoTitle,
    seoDescription: pkg.seoDescription,
    services: pkg.services.map((service) => ({
      id: service.id,
      inventoryItemId: service.inventoryItemId,
      dayOffset: service.dayOffset,
      position: service.position,
      itemName: service.inventoryItem.name,
      itemType: service.inventoryItem.type,
      itemProvince: service.inventoryItem.province,
      itemBasePrice: service.inventoryItem.basePrice.toString(),
      itemCurrency: service.inventoryItem.currency,
      itemMediaId: service.inventoryItem.media[0]?.id ?? null,
    })),
    days: pkg.days.map((day) => ({
      id: day.id,
      dayOffset: day.dayOffset,
      title: day.title,
      body: day.body,
      meals: day.meals,
    })),
    tiers: pkg.tiers.map((tier) => ({
      id: tier.id,
      code: tier.code,
      name: tier.name,
      description: tier.description,
      position: tier.position,
      priceDelta: tier.priceDelta.toString(),
      singleSupplement: tier.singleSupplement ? tier.singleSupplement.toString() : null,
      isDefault: tier.isDefault,
    })),
    departures: pkg.departures.map((departure) => ({
      id: departure.id,
      startDate: departure.startDate.toISOString(),
      capacity: departure.capacity,
      price: departure.price ? departure.price.toString() : null,
      status: departure.status,
    })),
    extras: pkg.extras.map((extra) => ({
      id: extra.id,
      code: extra.code,
      name: extra.name,
      description: extra.description,
      durationLabel: extra.durationLabel,
      dayOffset: extra.dayOffset,
      price: extra.price.toString(),
      priceUnit: extra.priceUnit,
      position: extra.position,
      active: extra.active,
    })),
    media: pkg.media.map((item) => ({
      id: item.id,
      altText: item.altText,
      position: item.position,
      showsPeople: item.showsPeople,
      hasConsent: (item.consentReference ?? '').trim().length > 0,
    })),
    translations: pkg.translations.map((translation) => ({
      id: translation.id,
      locale: translation.locale,
      name: translation.name,
      summary: translation.summary,
      description: translation.description,
      included: translation.included,
      excluded: translation.excluded,
      cubaNotes: translation.cubaNotes,
      seoTitle: translation.seoTitle,
      seoDescription: translation.seoDescription,
      days: translation.days ?? null,
      tiers: translation.tiers ?? null,
      extras: translation.extras ?? null,
      mediaAlt: translation.mediaAlt ?? null,
      published: translation.published,
      sourceUpdatedAt: translation.sourceUpdatedAt.toISOString(),
    })),
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

const INCLUDE_SERVICES = {
  services: {
    include: {
      inventoryItem: {
        include: { media: { orderBy: { position: 'asc' as const }, take: 1 } },
      },
    },
    orderBy: [{ dayOffset: 'asc' as const }, { position: 'asc' as const }],
  },
  days: { orderBy: { dayOffset: 'asc' as const } },
  tiers: { orderBy: { position: 'asc' as const } },
  departures: { orderBy: { startDate: 'asc' as const } },
  extras: { orderBy: { position: 'asc' as const } },
  media: { orderBy: { position: 'asc' as const } },
  translations: { orderBy: { locale: 'asc' as const } },
};

type TierInput = NonNullable<CreatePackageRequest['tiers']>[number];
type DepartureInput = NonNullable<CreatePackageRequest['departures']>[number];
type ExtraInput = NonNullable<CreatePackageRequest['extras']>[number];
type DayInput = NonNullable<CreatePackageRequest['days']>[number];

function tierCreate(tier: TierInput) {
  return {
    code: tier.code,
    name: tier.name,
    description: tier.description ?? null,
    position: tier.position,
    priceDelta: tier.priceDelta,
    singleSupplement: tier.singleSupplement ?? null,
    isDefault: tier.isDefault,
  };
}

function departureCreate(departure: DepartureInput) {
  return {
    startDate: departure.startDate,
    capacity: departure.capacity,
    price: departure.price ?? null,
    status: departure.status,
  };
}

function extraCreate(extra: ExtraInput) {
  return {
    code: extra.code,
    name: extra.name,
    description: extra.description ?? null,
    durationLabel: extra.durationLabel ?? null,
    inventoryItemId: extra.inventoryItemId ?? null,
    dayOffset: extra.dayOffset ?? null,
    price: extra.price,
    priceUnit: extra.priceUnit,
    position: extra.position,
    active: extra.active,
  };
}

function dayCreate(day: DayInput) {
  return {
    dayOffset: day.dayOffset,
    title: day.title,
    body: day.body ?? null,
    meals: day.meals ?? null,
  };
}

interface TranslationContent {
  days?: Record<string, { title?: string; body?: string; meals?: string }>;
  tiers?: Record<string, { name?: string; description?: string }>;
  extras?: Record<
    string,
    { name?: string; description?: string; durationLabel?: string }
  >;
  mediaAlt?: Record<string, string>;
}

/**
 * Overlay a locale's published translation onto a package DTO (M1, D1): the
 * scalar words, then the nested days (by dayOffset), tiers and extras (by code)
 * and media alt texts (by id). Anything missing falls back to the source. The
 * raw translations are stripped so a public read never leaks drafts.
 */
function overlayPackage(dto: PackageDto, locale: string | undefined): PackageDto {
  const translation = locale
    ? dto.translations.find((row) => row.locale === locale && row.published)
    : undefined;
  if (!translation) {
    return dto;
  }

  const content: TranslationContent = {
    days: (translation.days ?? undefined) as TranslationContent['days'],
    tiers: (translation.tiers ?? undefined) as TranslationContent['tiers'],
    extras: (translation.extras ?? undefined) as TranslationContent['extras'],
    mediaAlt: (translation.mediaAlt ?? undefined) as TranslationContent['mediaAlt'],
  };

  return {
    ...dto,
    name: translation.name ?? dto.name,
    summary: translation.summary ?? dto.summary,
    description: translation.description ?? dto.description,
    included: translation.included.length > 0 ? translation.included : dto.included,
    excluded: translation.excluded.length > 0 ? translation.excluded : dto.excluded,
    cubaNotes: translation.cubaNotes ?? dto.cubaNotes,
    seoTitle: translation.seoTitle ?? dto.seoTitle,
    seoDescription: translation.seoDescription ?? dto.seoDescription,
    days: dto.days.map((day) => {
      const overlay = content.days?.[String(day.dayOffset)];
      return overlay
        ? {
            ...day,
            title: overlay.title ?? day.title,
            body: overlay.body ?? day.body,
            meals: overlay.meals ?? day.meals,
          }
        : day;
    }),
    tiers: dto.tiers.map((tier) => {
      const overlay = content.tiers?.[tier.code];
      return overlay
        ? {
            ...tier,
            name: overlay.name ?? tier.name,
            description: overlay.description ?? tier.description,
          }
        : tier;
    }),
    extras: dto.extras.map((extra) => {
      const overlay = content.extras?.[extra.code];
      return overlay
        ? {
            ...extra,
            name: overlay.name ?? extra.name,
            description: overlay.description ?? extra.description,
            durationLabel: overlay.durationLabel ?? extra.durationLabel,
          }
        : extra;
    }),
    media: dto.media.map((item) => ({
      ...item,
      altText: content.mediaAlt?.[item.id] ?? item.altText,
    })),
    translations: [],
  };
}

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const MEDIA_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const EXTENSION_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function packageMediaKey(packageId: string, contentType: string): string {
  const extension = MEDIA_EXTENSION[contentType] ?? 'bin';
  return `packages/${packageId}/${randomUUID()}.${extension}`;
}

/**
 * Curated package catalogue (spec §3.3). Packages are templates; booking one
 * expands its service list into a Reservation via MeService, so the dispatch
 * and document pipelines are untouched.
 */
@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async list(filters: ListPackagesQuery): Promise<PackageDto[]> {
    const where: Prisma.PackageWhereInput = {};
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.province) where.province = filters.province;

    const packages = await this.prisma.package.findMany({
      where,
      include: INCLUDE_SERVICES,
      orderBy: { createdAt: 'asc' },
    });
    return packages.map(toPackageDto);
  }

  /** The storefront sees published packages only, in the requested locale. */
  async listPublic(filters: ListPackagesQuery): Promise<PackageDto[]> {
    const packages = await this.list({ ...filters, status: 'PUBLISHED' });
    return packages.map((pkg) => overlayPackage(pkg, filters.locale));
  }

  async getById(id: string): Promise<PackageDto> {
    return toPackageDto(await this.loadWithServices(id));
  }

  async getBySlug(slug: string, locale?: string): Promise<PackageDto> {
    const pkg = await this.prisma.package.findUnique({
      where: { slug },
      include: INCLUDE_SERVICES,
    });
    if (pkg && pkg.status === 'PUBLISHED') {
      return overlayPackage(toPackageDto(pkg), locale);
    }

    // A retired slug redirects to its package (the storefront 308s to the
    // current slug when they differ).
    const redirect = await this.prisma.packageSlugRedirect.findUnique({
      where: { slug },
    });
    if (redirect) {
      const target = await this.prisma.package.findUnique({
        where: { id: redirect.packageId },
        include: INCLUDE_SERVICES,
      });
      if (target && target.status === 'PUBLISHED') {
        return overlayPackage(toPackageDto(target), locale);
      }
    }

    throw new NotFoundException(`Package ${slug} not found`);
  }

  async create(input: CreatePackageRequest, actor: AuthUser): Promise<PackageDto> {
    const ids = input.services.map((service) => service.inventoryItemId);
    await this.assertInventoryItems(ids);

    const slug = input.slug ?? (await this.uniqueSlug(slugify(input.name)));
    if (input.status === 'PUBLISHED') {
      assertPublishable({
        name: input.name,
        slug,
        serviceCount: input.services.length,
        departureCount: input.departures?.length ?? 0,
        bookingModel: input.bookingModel,
        cancellationPolicy: input.cancellationPolicy ?? null,
        depositPolicy: input.depositPolicy ?? null,
        media: [],
        knownPolicyKeys: knownPolicyKeys(this.tenant),
      });
    }

    const created = await this.prisma.package.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        summary: input.summary ?? null,
        province: input.province ?? null,
        durationDays: input.durationDays,
        currency: input.currency,
        basePrice: input.basePrice,
        status: input.status ?? 'DRAFT',
        publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
        bookingModel: input.bookingModel,
        groupMin: input.groupMin ?? null,
        groupMax: input.groupMax ?? null,
        leadTimeDays: input.leadTimeDays,
        tourismCategory: input.tourismCategory,
        themes: input.themes ?? [],
        difficulty: input.difficulty ?? null,
        accessibility: input.accessibility ?? [],
        cancellationPolicy: input.cancellationPolicy ?? null,
        depositPolicy: input.depositPolicy ?? null,
        included: input.included ?? [],
        excluded: input.excluded ?? [],
        cubaNotes: input.cubaNotes ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue,
        services: {
          create: input.services.map((service) => ({
            inventoryItemId: service.inventoryItemId,
            dayOffset: service.dayOffset,
            position: service.position,
          })),
        },
        ...(input.tiers ? { tiers: { create: input.tiers.map(tierCreate) } } : {}),
        ...(input.departures
          ? { departures: { create: input.departures.map(departureCreate) } }
          : {}),
        ...(input.extras ? { extras: { create: input.extras.map(extraCreate) } } : {}),
        ...(input.days ? { days: { create: input.days.map(dayCreate) } } : {}),
      },
      include: INCLUDE_SERVICES,
    });

    await this.audit(actor, 'package.created', created.id);
    return toPackageDto(created);
  }

  async update(
    id: string,
    input: UpdatePackageRequest,
    actor: AuthUser,
  ): Promise<PackageDto> {
    const existing = await this.loadPackage(id);

    const data: Prisma.PackageUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.description !== undefined) data.description = input.description;
    if (input.province !== undefined) data.province = input.province;
    if (input.durationDays !== undefined) data.durationDays = input.durationDays;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.basePrice !== undefined) data.basePrice = input.basePrice;
    if (input.status !== undefined) {
      data.status = input.status;
      // Stamp the first publish; a later status change keeps the original.
      if (input.status === 'PUBLISHED' && existing.publishedAt === null) {
        data.publishedAt = new Date();
      }
    }
    if (input.attributes !== undefined) {
      data.attributes = input.attributes as Prisma.InputJsonValue;
    }
    if (input.summary !== undefined) data.summary = input.summary;
    if (input.bookingModel !== undefined) data.bookingModel = input.bookingModel;
    if (input.groupMin !== undefined) data.groupMin = input.groupMin;
    if (input.groupMax !== undefined) data.groupMax = input.groupMax;
    if (input.leadTimeDays !== undefined) data.leadTimeDays = input.leadTimeDays;
    if (input.tourismCategory !== undefined) data.tourismCategory = input.tourismCategory;
    if (input.themes !== undefined) data.themes = input.themes;
    if (input.difficulty !== undefined) data.difficulty = input.difficulty;
    if (input.accessibility !== undefined) data.accessibility = input.accessibility;
    if (input.cancellationPolicy !== undefined) {
      data.cancellationPolicy = input.cancellationPolicy;
    }
    if (input.depositPolicy !== undefined) data.depositPolicy = input.depositPolicy;
    if (input.included !== undefined) data.included = input.included;
    if (input.excluded !== undefined) data.excluded = input.excluded;
    if (input.cubaNotes !== undefined) data.cubaNotes = input.cubaNotes;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;

    const services = input.services;
    if (services) {
      await this.assertInventoryItems(services.map((service) => service.inventoryItemId));
    }
    // A package that is PUBLISHED after this save must pass the checks as it
    // will then stand, whether the save publishes it or edits a published one.
    if ((input.status ?? existing.status) === 'PUBLISHED') {
      const current = await this.loadWithServices(id);
      assertPublishable({
        name: input.name ?? current.name,
        slug: input.slug ?? current.slug,
        serviceCount: services?.length ?? current.services.length,
        departureCount: input.departures?.length ?? current.departures.length,
        bookingModel: input.bookingModel ?? current.bookingModel,
        cancellationPolicy:
          input.cancellationPolicy !== undefined
            ? input.cancellationPolicy
            : current.cancellationPolicy,
        depositPolicy:
          input.depositPolicy !== undefined ? input.depositPolicy : current.depositPolicy,
        media: current.media,
        knownPolicyKeys: knownPolicyKeys(this.tenant),
      });
    }
    const slugChanged = input.slug !== undefined && input.slug !== existing.slug;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Each collection, when present, is replaced wholesale: simpler and
      // race-free for an editor that submits the whole list at once.
      if (services) {
        await tx.packageService.deleteMany({ where: { packageId: id } });
      }
      if (input.tiers) {
        await tx.packageTier.deleteMany({ where: { packageId: id } });
      }
      if (input.departures) {
        await tx.packageDeparture.deleteMany({ where: { packageId: id } });
      }
      if (input.extras) {
        await tx.packageExtra.deleteMany({ where: { packageId: id } });
      }
      if (input.days) {
        await tx.packageDay.deleteMany({ where: { packageId: id } });
      }
      if (slugChanged) {
        // Keep a retired slug pointing at the package so old links resolve.
        await tx.packageSlugRedirect.upsert({
          where: { slug: existing.slug },
          create: { slug: existing.slug, packageId: id },
          update: { packageId: id },
        });
      }

      return tx.package.update({
        where: { id },
        data: {
          ...data,
          ...(services
            ? {
                services: {
                  create: services.map((service) => ({
                    inventoryItemId: service.inventoryItemId,
                    dayOffset: service.dayOffset,
                    position: service.position,
                  })),
                },
              }
            : {}),
          ...(input.tiers ? { tiers: { create: input.tiers.map(tierCreate) } } : {}),
          ...(input.departures
            ? { departures: { create: input.departures.map(departureCreate) } }
            : {}),
          ...(input.extras ? { extras: { create: input.extras.map(extraCreate) } } : {}),
          ...(input.days ? { days: { create: input.days.map(dayCreate) } } : {}),
        },
        include: INCLUDE_SERVICES,
      });
    });

    await this.audit(actor, 'package.updated', id);
    return toPackageDto(updated);
  }

  /** Upsert one locale's text overlay (M1, D1) and audit it. */
  async upsertTranslation(
    id: string,
    locale: string,
    input: PutPackageTranslationRequest,
    actor: AuthUser,
  ): Promise<PackageDto> {
    const pkg = await this.loadPackage(id);

    const data: Prisma.PackageTranslationUncheckedCreateInput = {
      packageId: id,
      locale,
      sourceUpdatedAt: pkg.contentUpdatedAt,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.included !== undefined ? { included: input.included } : {}),
      ...(input.excluded !== undefined ? { excluded: input.excluded } : {}),
      ...(input.cubaNotes !== undefined ? { cubaNotes: input.cubaNotes } : {}),
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
      ...(input.seoDescription !== undefined
        ? { seoDescription: input.seoDescription }
        : {}),
      ...(input.days !== undefined ? { days: input.days as Prisma.InputJsonValue } : {}),
      ...(input.tiers !== undefined
        ? { tiers: input.tiers as Prisma.InputJsonValue }
        : {}),
      ...(input.extras !== undefined
        ? { extras: input.extras as Prisma.InputJsonValue }
        : {}),
      ...(input.mediaAlt !== undefined
        ? { mediaAlt: input.mediaAlt as Prisma.InputJsonValue }
        : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
    };

    await this.prisma.packageTranslation.upsert({
      where: { packageId_locale: { packageId: id, locale } },
      create: data,
      update: { ...data, packageId: undefined, locale: undefined },
    });

    await this.audit(actor, 'package.translation_saved', id);
    return this.getById(id);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    await this.loadPackage(id);
    // Services cascade; reservations keep their history via ON DELETE SET NULL.
    await this.prisma.package.delete({ where: { id } });
    await this.audit(actor, 'package.deleted', id);
  }

  /** Store a package photo (M1); the row keeps its alt text and consent. */
  async uploadMedia(
    id: string,
    input: PackageMediaUploadRequest,
    actor: AuthUser,
  ): Promise<PackageMediaDto> {
    await this.loadPackage(id);

    const data = Buffer.from(input.contentBase64, 'base64');
    if (data.length === 0) {
      throw new BadRequestException('Media file is empty');
    }
    if (data.length > MAX_MEDIA_BYTES) {
      throw new BadRequestException('Media file exceeds 5 MB');
    }

    const position = await this.prisma.packageMedia.count({ where: { packageId: id } });
    const key = packageMediaKey(id, input.contentType);
    await this.storage.put(key, data, input.contentType);

    const media = await this.prisma.packageMedia.create({
      data: {
        packageId: id,
        storageKey: key,
        altText: input.altText,
        position,
        showsPeople: input.showsPeople,
        consentReference: input.consentReference ?? null,
      },
    });
    await this.audit(actor, 'package.media_added', id);
    return {
      id: media.id,
      altText: media.altText,
      position: media.position,
      showsPeople: media.showsPeople,
      hasConsent: (media.consentReference ?? '').trim().length > 0,
    };
  }

  async deleteMedia(id: string, mediaId: string, actor: AuthUser): Promise<void> {
    await this.loadPackage(id);
    const media = await this.prisma.packageMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.packageId !== id) {
      throw new NotFoundException(`Media ${mediaId} not found for this package`);
    }
    await this.storage.delete(media.storageKey).catch(() => undefined);
    await this.prisma.packageMedia.delete({ where: { id: mediaId } });
    await this.audit(actor, 'package.media_deleted', id);
  }

  /**
   * Stream a stored package photo. The public route passes `onlyPublished` so
   * photos of a draft package are not served to the world.
   */
  async readMedia(
    mediaId: string,
    onlyPublished: boolean,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    const media = await this.prisma.packageMedia.findUnique({
      where: { id: mediaId },
      include: { package: { select: { status: true } } },
    });
    if (!media || (onlyPublished && media.package.status !== 'PUBLISHED')) {
      throw new NotFoundException(`Media ${mediaId} not found`);
    }

    const object = await this.storage.get(media.storageKey);
    if (!object) {
      throw new NotFoundException('Media object is missing from storage');
    }
    const extension = media.storageKey.split('.').pop()?.toLowerCase() ?? '';
    return {
      data: object.body,
      contentType:
        object.contentType ||
        EXTENSION_CONTENT_TYPE[extension] ||
        'application/octet-stream',
    };
  }

  private async assertInventoryItems(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const count = await this.prisma.inventoryItem.count({
      where: { id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('One or more catalog items do not exist');
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (
      await this.prisma.package.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })
    ) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private async loadPackage(id: string): Promise<Package> {
    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) {
      throw new NotFoundException(`Package ${id} not found`);
    }
    return pkg;
  }

  private async loadWithServices(id: string): Promise<PackageWithServices> {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      include: INCLUDE_SERVICES,
    });
    if (!pkg) {
      throw new NotFoundException(`Package ${id} not found`);
    }
    return pkg;
  }

  private async audit(actor: AuthUser, action: string, packageId: string): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action,
        entityType: 'Package',
        entityId: packageId,
      },
    });
  }
}
