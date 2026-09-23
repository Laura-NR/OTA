import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type {
  InventoryItem,
  InventoryMedia,
  Package,
  PackageService,
  Prisma,
} from '@ota/db';
import type {
  CreatePackageRequest,
  ListPackagesQuery,
  PackageDto,
  UpdatePackageRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

type ServiceWithItem = PackageService & {
  inventoryItem: InventoryItem & { media: InventoryMedia[] };
};
type PackageWithServices = Package & { services: ServiceWithItem[] };

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

function toPackageDto(pkg: PackageWithServices): PackageDto {
  return {
    id: pkg.id,
    name: pkg.name,
    slug: pkg.slug,
    description: pkg.description,
    province: pkg.province,
    durationDays: pkg.durationDays,
    currency: pkg.currency,
    basePrice: pkg.basePrice.toString(),
    active: pkg.active,
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
};

/**
 * Curated package catalogue (spec §3.3). Packages are templates; booking one
 * expands its service list into a Reservation via MeService, so the dispatch
 * and document pipelines are untouched.
 */
@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListPackagesQuery): Promise<PackageDto[]> {
    const where: Prisma.PackageWhereInput = {};
    if (filters.active !== undefined) where.active = filters.active;
    if (filters.province) where.province = filters.province;

    const packages = await this.prisma.package.findMany({
      where,
      include: INCLUDE_SERVICES,
      orderBy: { createdAt: 'asc' },
    });
    return packages.map(toPackageDto);
  }

  /** The storefront sees active packages only. */
  async listPublic(filters: ListPackagesQuery): Promise<PackageDto[]> {
    return this.list({ ...filters, active: true });
  }

  async getById(id: string): Promise<PackageDto> {
    return toPackageDto(await this.loadWithServices(id));
  }

  async getBySlug(slug: string): Promise<PackageDto> {
    const pkg = await this.prisma.package.findUnique({
      where: { slug },
      include: INCLUDE_SERVICES,
    });
    if (!pkg || !pkg.active) {
      throw new NotFoundException(`Package ${slug} not found`);
    }
    return toPackageDto(pkg);
  }

  async create(input: CreatePackageRequest, actor: AuthUser): Promise<PackageDto> {
    const ids = input.services.map((service) => service.inventoryItemId);
    await this.assertInventoryItems(ids);

    const slug = input.slug ?? (await this.uniqueSlug(slugify(input.name)));
    const created = await this.prisma.package.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        province: input.province ?? null,
        durationDays: input.durationDays,
        currency: input.currency,
        basePrice: input.basePrice,
        active: input.active ?? true,
        attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue,
        services: {
          create: input.services.map((service) => ({
            inventoryItemId: service.inventoryItemId,
            dayOffset: service.dayOffset,
            position: service.position,
          })),
        },
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
    await this.loadPackage(id);

    const data: Prisma.PackageUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.description !== undefined) data.description = input.description;
    if (input.province !== undefined) data.province = input.province;
    if (input.durationDays !== undefined) data.durationDays = input.durationDays;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.basePrice !== undefined) data.basePrice = input.basePrice;
    if (input.active !== undefined) data.active = input.active;
    if (input.attributes !== undefined) {
      data.attributes = input.attributes as Prisma.InputJsonValue;
    }

    const services = input.services;
    if (services) {
      await this.assertInventoryItems(services.map((service) => service.inventoryItemId));
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (services) {
        // The itinerary is replaced wholesale: simpler and race-free for an
        // editor that submits the whole list at once.
        await tx.packageService.deleteMany({ where: { packageId: id } });
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
        },
        include: INCLUDE_SERVICES,
      });
    });

    await this.audit(actor, 'package.updated', id);
    return toPackageDto(updated);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    await this.loadPackage(id);
    // Services cascade; reservations keep their history via ON DELETE SET NULL.
    await this.prisma.package.delete({ where: { id } });
    await this.audit(actor, 'package.deleted', id);
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
