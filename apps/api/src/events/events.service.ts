import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import {
  eventPublishIssues,
  zonedCalendarDay,
  type EventAccess,
  type EventStatus,
  type SeatCategoryKind,
} from '@ota/domain';
import type {
  EventDto,
  EventListItemDto,
  EventTranslationDto,
  EventTranslationWriteRequest,
  EventWriteRequest,
  PublicEventDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { slugify } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

const INCLUDE = {
  nights: { orderBy: { position: 'asc' } },
  categories: { orderBy: { position: 'asc' } },
  translations: { orderBy: { locale: 'asc' } },
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof INCLUDE }>;
type Tx = Prisma.TransactionClient;

/** Requests that still hold a night or a category the desk might remove. */
const OPEN_STATUSES = ['SUBMITTED', 'REQUESTING'] as const;

interface NightOverlay {
  label?: string | null;
  venue?: string | null;
}

interface CategoryOverlay {
  name?: string | null;
  description?: string | null;
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function overlayMap<T>(value: Prisma.JsonValue | null): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

/**
 * M10 events (`docs/schema-m10-events.md` D1, D2): the desk keeps each event's
 * nights, seat categories and per-locale text; the storefront reads the
 * published, not-yet-ended ones in its language. Nights and categories are
 * kept by id across saves because requests point at them.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async list(): Promise<EventListItemDto[]> {
    const rows = await this.prisma.event.findMany({
      orderBy: [{ startsOn: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { requests: true } } },
    });
    const open = await this.prisma.eventRequest.groupBy({
      by: ['eventId'],
      where: { status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    });
    const openBy = new Map(open.map((row) => [row.eventId, row._count._all]));
    return rows.map((row) => ({
      ...this.listFields(row),
      requestCount: row._count.requests,
      openRequestCount: openBy.get(row.id) ?? 0,
    }));
  }

  async get(id: string): Promise<EventDto> {
    const row = await this.load(id);
    const [requestCount, openRequestCount] = await Promise.all([
      this.prisma.eventRequest.count({ where: { eventId: id } }),
      this.prisma.eventRequest.count({
        where: { eventId: id, status: { in: [...OPEN_STATUSES] } },
      }),
    ]);
    const updated = row.updatedAt.getTime();
    return {
      ...this.listFields(row),
      requestCount,
      openRequestCount,
      confirmBy: row.confirmBy ? day(row.confirmBy) : null,
      sourceLocale: row.sourceLocale,
      place: row.place,
      summary: row.summary,
      notes: row.notes,
      nights: row.nights.map((night) => ({
        id: night.id,
        date: day(night.date),
        label: night.label,
        venue: night.venue,
        position: night.position,
      })),
      categories: row.categories.map((category) => ({
        id: category.id,
        kind: category.kind as SeatCategoryKind,
        name: category.name,
        description: category.description,
        pricePerSeat:
          category.pricePerSeat === null ? null : Number(category.pricePerSeat),
        currency: category.currency,
        position: category.position,
      })),
      translations: row.translations.map((translation): EventTranslationDto => ({
        locale: translation.locale,
        name: translation.name,
        place: translation.place,
        summary: translation.summary,
        notes: translation.notes,
        nights: overlayMap(translation.nights),
        categories: overlayMap(translation.categories),
        published: translation.published,
        stale: translation.sourceUpdatedAt.getTime() < updated,
        updatedAt: translation.updatedAt.toISOString(),
      })),
      publishIssues: eventPublishIssues(this.publishInput(row), new Date()),
    };
  }

  async create(actor: AuthUser, input: EventWriteRequest): Promise<EventDto> {
    const slug = await this.uniqueSlug(slugify(input.name, 'event'));
    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          slug,
          ...this.fields(input),
          nights: {
            create: input.nights.map((night, position) => ({
              date: night.date,
              label: night.label,
              venue: night.venue,
              position,
            })),
          },
          categories: {
            create: input.categories.map((category, position) => ({
              kind: category.kind,
              name: category.name,
              description: category.description,
              pricePerSeat: category.pricePerSeat,
              currency: this.tenant.concierge.currency,
              position,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'event.created',
          entityType: 'Event',
          entityId: event.id,
          metadata: { slug, name: input.name },
        },
      });
      return event;
    });
    return this.get(created.id);
  }

  /**
   * Save the whole document. A night or category that a request holds cannot
   * be removed; a published event must still pass the publish checks.
   */
  async update(actor: AuthUser, id: string, input: EventWriteRequest): Promise<EventDto> {
    const row = await this.load(id);
    const nightIds = new Set(row.nights.map((night) => night.id));
    const categoryIds = new Set(row.categories.map((category) => category.id));
    if (input.nights.some((night) => night.id && !nightIds.has(night.id))) {
      throw new UnprocessableEntityException('A night belongs to another event');
    }
    if (
      input.categories.some((category) => category.id && !categoryIds.has(category.id))
    ) {
      throw new UnprocessableEntityException('A category belongs to another event');
    }

    const keptNights = new Set(
      input.nights.flatMap((night) => (night.id ? [night.id] : [])),
    );
    const keptCategories = new Set(
      input.categories.flatMap((category) => (category.id ? [category.id] : [])),
    );
    const removedNights = [...nightIds].filter((nightId) => !keptNights.has(nightId));
    const removedCategories = [...categoryIds].filter(
      (categoryId) => !keptCategories.has(categoryId),
    );
    if (removedNights.length > 0) {
      const holding = await this.prisma.eventRequest.count({
        where: { eventId: id, nightIds: { hasSome: removedNights } },
      });
      if (holding > 0) {
        throw new ConflictException('A request holds a night you removed');
      }
    }
    if (removedCategories.length > 0) {
      const holding = await this.prisma.eventRequest.count({
        where: { categoryId: { in: removedCategories } },
      });
      if (holding > 0) {
        throw new ConflictException('A request holds a category you removed');
      }
    }
    if (row.status === 'PUBLISHED') {
      this.assertPublishable({
        access: input.access,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        confirmBy: input.confirmBy,
        nights: input.nights,
        categories: input.categories,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id }, data: this.fields(input) });
      await tx.eventNight.deleteMany({ where: { id: { in: removedNights } } });
      await tx.eventSeatCategory.deleteMany({ where: { id: { in: removedCategories } } });
      // Kept rows move out of the way first: positions are unique per event.
      await tx.eventNight.updateMany({
        where: { eventId: id },
        data: { position: { increment: 1000 } },
      });
      await tx.eventSeatCategory.updateMany({
        where: { eventId: id },
        data: { position: { increment: 1000 } },
      });
      await this.writeNights(tx, id, input);
      await this.writeCategories(tx, id, input);
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'event.updated',
          entityType: 'Event',
          entityId: id,
          metadata: {
            nights: input.nights.length,
            categories: input.categories.length,
            removedNights: removedNights.length,
            removedCategories: removedCategories.length,
          },
        },
      });
    });
    return this.get(id);
  }

  /** One locale's overlay; the source locale is edited on the event itself. */
  async putTranslation(
    actor: AuthUser,
    id: string,
    locale: string,
    input: EventTranslationWriteRequest,
  ): Promise<EventDto> {
    const row = await this.load(id);
    if (!this.tenant.supportedLocales.includes(locale)) {
      throw new UnprocessableEntityException(`${locale} is not a site language`);
    }
    if (locale === row.sourceLocale) {
      throw new UnprocessableEntityException('The source text is edited on the event');
    }
    const nightIds = new Set(row.nights.map((night) => night.id));
    const categoryIds = new Set(row.categories.map((category) => category.id));
    if (Object.keys(input.nights).some((key) => !nightIds.has(key))) {
      throw new UnprocessableEntityException('A night belongs to another event');
    }
    if (Object.keys(input.categories).some((key) => !categoryIds.has(key))) {
      throw new UnprocessableEntityException('A category belongs to another event');
    }
    const data = {
      name: input.name ?? null,
      place: input.place ?? null,
      summary: input.summary ?? null,
      notes: input.notes ?? null,
      nights: input.nights as Prisma.InputJsonValue,
      categories: input.categories as Prisma.InputJsonValue,
      published: input.published,
      sourceUpdatedAt: row.updatedAt,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.eventTranslation.upsert({
        where: { eventId_locale: { eventId: id, locale } },
        create: { eventId: id, locale, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'event.translated',
          entityType: 'Event',
          entityId: id,
          metadata: { locale, published: input.published },
        },
      });
    });
    return this.get(id);
  }

  async publish(actor: AuthUser, id: string): Promise<EventDto> {
    const row = await this.load(id);
    this.assertPublishable(this.publishInput(row));
    await this.setStatus(actor, row, 'PUBLISHED');
    return this.get(id);
  }

  async archive(actor: AuthUser, id: string): Promise<EventDto> {
    const row = await this.load(id);
    await this.setStatus(actor, row, 'ARCHIVED');
    return this.get(id);
  }

  /** Only an event nobody has requested is deleted; archiving is the path otherwise. */
  async remove(actor: AuthUser, id: string): Promise<void> {
    const row = await this.load(id);
    const requests = await this.prisma.eventRequest.count({ where: { eventId: id } });
    if (requests > 0) {
      throw new ConflictException('Requests point at this event; archive it instead');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'event.deleted',
          entityType: 'Event',
          entityId: id,
          metadata: { slug: row.slug },
        },
      });
    });
  }

  /** Published events that have not ended in Havana, soonest first (D2). */
  async listPublic(locale: string | undefined): Promise<PublicEventDto[]> {
    const rows = await this.prisma.event.findMany({
      where: { status: 'PUBLISHED', endsOn: { gte: zonedCalendarDay(new Date()) } },
      orderBy: [{ startsOn: 'asc' }, { name: 'asc' }],
      include: INCLUDE,
    });
    return rows.map((row) => this.toPublic(row, locale));
  }

  async getPublic(slug: string, locale: string | undefined): Promise<PublicEventDto> {
    const row = await this.prisma.event.findFirst({
      where: {
        slug,
        status: 'PUBLISHED',
        endsOn: { gte: zonedCalendarDay(new Date()) },
      },
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Event ${slug} not found`);
    }
    return this.toPublic(row, locale);
  }

  /**
   * The text in `locale` from its published overlay, field by field, with the
   * source as the fallback; `locale` names the overlay's language only when
   * one was used.
   */
  toPublic(row: EventRow, locale: string | undefined): PublicEventDto {
    const overlay =
      locale && locale !== row.sourceLocale
        ? row.translations.find(
            (translation) => translation.locale === locale && translation.published,
          )
        : undefined;
    const nights = overlayMap<NightOverlay>(overlay?.nights ?? null);
    const categories = overlayMap<CategoryOverlay>(overlay?.categories ?? null);
    return {
      slug: row.slug,
      access: row.access as EventAccess,
      province: row.province,
      startsOn: day(row.startsOn),
      endsOn: day(row.endsOn),
      datesConfirmed: row.datesConfirmed,
      confirmBy: row.confirmBy ? day(row.confirmBy) : null,
      name: overlay?.name ?? row.name,
      place: overlay?.place ?? row.place,
      summary: overlay?.summary ?? row.summary,
      notes: overlay?.notes ?? row.notes,
      locale: overlay ? overlay.locale : row.sourceLocale,
      nights: row.nights.map((night) => ({
        id: night.id,
        date: day(night.date),
        label: nights[night.id]?.label ?? night.label,
        venue: nights[night.id]?.venue ?? night.venue,
      })),
      categories: row.categories.map((category) => ({
        id: category.id,
        kind: category.kind as SeatCategoryKind,
        name: categories[category.id]?.name ?? category.name,
        description: categories[category.id]?.description ?? category.description,
        pricePerSeat:
          category.pricePerSeat === null ? null : Number(category.pricePerSeat),
        currency: category.currency,
      })),
    };
  }

  private async setStatus(actor: AuthUser, row: EventRow, status: EventStatus) {
    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: row.id },
        data: {
          status,
          ...(status === 'PUBLISHED' && !row.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: status === 'PUBLISHED' ? 'event.published' : 'event.archived',
          entityType: 'Event',
          entityId: row.id,
          metadata: { from: row.status, to: status },
        },
      });
    });
  }

  private assertPublishable(input: Parameters<typeof eventPublishIssues>[0]): void {
    const issues = eventPublishIssues(input, new Date());
    if (issues.length > 0) {
      throw new ConflictException({
        message: 'The event cannot be published as it stands',
        issues,
      });
    }
  }

  private publishInput(row: EventRow): Parameters<typeof eventPublishIssues>[0] {
    return {
      access: row.access as EventAccess,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      confirmBy: row.confirmBy,
      nights: row.nights,
      categories: row.categories.map((category) => ({
        kind: category.kind as SeatCategoryKind,
      })),
    };
  }

  private fields(input: EventWriteRequest) {
    return {
      access: input.access,
      province: input.province,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      datesConfirmed: input.datesConfirmed,
      confirmBy: input.confirmBy,
      sourceLocale: input.sourceLocale,
      name: input.name,
      place: input.place,
      summary: input.summary,
      notes: input.notes,
    };
  }

  private async writeNights(tx: Tx, eventId: string, input: EventWriteRequest) {
    for (const [position, night] of input.nights.entries()) {
      const data = { date: night.date, label: night.label, venue: night.venue, position };
      if (night.id) {
        await tx.eventNight.update({ where: { id: night.id }, data });
      } else {
        await tx.eventNight.create({ data: { eventId, ...data } });
      }
    }
  }

  private async writeCategories(tx: Tx, eventId: string, input: EventWriteRequest) {
    for (const [position, category] of input.categories.entries()) {
      const data = {
        kind: category.kind,
        name: category.name,
        description: category.description,
        pricePerSeat: category.pricePerSeat,
        position,
      };
      if (category.id) {
        await tx.eventSeatCategory.update({ where: { id: category.id }, data });
      } else {
        await tx.eventSeatCategory.create({
          data: { eventId, currency: this.tenant.concierge.currency, ...data },
        });
      }
    }
  }

  private listFields(row: Prisma.EventGetPayload<object>) {
    return {
      id: row.id,
      slug: row.slug,
      status: row.status as EventStatus,
      access: row.access as EventAccess,
      province: row.province,
      startsOn: day(row.startsOn),
      endsOn: day(row.endsOn),
      datesConfirmed: row.datesConfirmed,
      name: row.name,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async load(id: string): Promise<EventRow> {
    const row = await this.prisma.event.findUnique({ where: { id }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException(`Event ${id} not found`);
    }
    return row;
  }

  private async uniqueSlug(base: string): Promise<string> {
    for (let suffix = 1; suffix < 50; suffix += 1) {
      const slug = suffix === 1 ? base : `${base}-${suffix}`;
      const clash = await this.prisma.event.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!clash) return slug;
    }
    throw new ConflictException('Could not allocate a unique event slug');
  }
}
