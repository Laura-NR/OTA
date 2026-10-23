import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ota/db';
import type {
  AuditLogQuery,
  IntegrationStatusDto,
  SystemAuditEntryDto,
} from '@ota/schemas';

import { PrismaService } from '../prisma/prisma.service';

/**
 * The integrations the platform reads from the environment (Q12): the page
 * shows whether each is configured, never a value. Rotation stays a deploy.
 */
export const INTEGRATION_KEYS = [
  'AUTH_SECRET',
  'PASSPORT_ENCRYPTION_KEY',
  'SMTP_HOST',
  'S3_ENDPOINT',
  'REDIS_URL',
  'PAYMENT_PROVIDER_CARD',
  'PAYMENT_PROVIDER_BANK_TRANSFER',
  'AI_PROVIDER',
] as const;

/** The Super Admin's Security & audit tab (M9). */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogQuery): Promise<SystemAuditEntryDto[]> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = { startsWith: query.action };
    if (query.before) where.createdAt = { lt: query.before };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: { actor: { select: { fullName: true, email: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorName: row.actor ? (row.actor.fullName ?? row.actor.email) : null,
      createdAt: row.createdAt.toISOString(),
      metadata:
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
    }));
  }

  integrations(env: NodeJS.ProcessEnv = process.env): IntegrationStatusDto[] {
    return INTEGRATION_KEYS.map((key) => ({ key, configured: Boolean(env[key]) }));
  }
}
