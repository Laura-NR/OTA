import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ImportBatch, Prisma } from '@ota/db';
import { mapAndValidate, parseTabular } from '@ota/imports';
import { inventoryImportRowSchema } from '@ota/schemas';
import type {
  CommitImportRequest,
  ImportBatchDto,
  ImportCommitResultDto,
  ImportPreviewDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

const PREVIEW_ROWS = 10;

function toBatchDto(batch: ImportBatch): ImportBatchDto {
  return {
    id: batch.id,
    filename: batch.filename,
    status: batch.status,
    columns: batch.columns,
    rowCount: batch.rowCount,
    importedCount: batch.importedCount,
    errors: (batch.errors as ImportBatchDto['errors']) ?? null,
    createdAt: batch.createdAt.toISOString(),
  };
}

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Parse an uploaded CSV/XLSX and stage it for column mapping. */
  async preview(
    filename: string,
    contentBase64: string,
    actor: AuthUser,
  ): Promise<ImportPreviewDto> {
    let table;
    try {
      table = await parseTabular(filename, Buffer.from(contentBase64, 'base64'));
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Could not parse the file',
      );
    }
    if (table.columns.length === 0) {
      throw new BadRequestException('No columns detected in the file');
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        createdByUserId: actor.id,
        filename,
        columns: table.columns,
        rowCount: table.rows.length,
        rows: table.rows as Prisma.InputJsonValue,
        status: 'STAGED',
      },
    });

    return {
      batchId: batch.id,
      filename,
      columns: batch.columns,
      rowCount: batch.rowCount,
      preview: table.rows.slice(0, PREVIEW_ROWS),
    };
  }

  async get(id: string): Promise<ImportBatchDto> {
    return toBatchDto(await this.load(id));
  }

  /**
   * Validate every staged row against the mapping and, if all pass, create the
   * inventory items. Validation errors abort the commit and are recorded on the
   * batch for the admin to fix (spec §4.7).
   */
  async commit(
    id: string,
    request: CommitImportRequest,
    actor: AuthUser,
  ): Promise<ImportCommitResultDto> {
    const batch = await this.load(id);
    if (batch.status !== 'STAGED') {
      throw new ConflictException(`Import batch is already ${batch.status}`);
    }

    const rows = batch.rows as Record<string, string>[];
    const { records, errors } = mapAndValidate(
      rows,
      request.mapping,
      inventoryImportRowSchema,
    );

    if (errors.length > 0) {
      await this.prisma.importBatch.update({
        where: { id },
        data: {
          status: 'FAILED',
          mapping: request.mapping as Prisma.InputJsonValue,
          errors: errors as unknown as Prisma.InputJsonValue,
        },
      });
      throw new UnprocessableEntityException({
        error: 'ImportValidationError',
        errors,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const record of records) {
        await tx.inventoryItem.create({
          data: {
            type: record.value.type,
            name: record.value.name,
            description: record.value.description ?? null,
            province: record.value.province ?? null,
            currency: record.value.currency ?? 'EUR',
            basePrice: record.value.basePrice,
            active: true,
          },
        });
      }
      await tx.importBatch.update({
        where: { id },
        data: {
          status: 'COMMITTED',
          mapping: request.mapping as Prisma.InputJsonValue,
          importedCount: records.length,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'import.committed',
          entityType: 'ImportBatch',
          entityId: id,
          metadata: { importedCount: records.length },
        },
      });
    });

    return { batchId: id, importedCount: records.length };
  }

  private async load(id: string): Promise<ImportBatch> {
    const batch = await this.prisma.importBatch.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException(`Import batch ${id} not found`);
    }
    return batch;
  }
}
