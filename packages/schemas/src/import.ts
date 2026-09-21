import { z } from 'zod';

import { inventoryTypeSchema } from './inventory';

/** A single validated import row, before it becomes an InventoryItem. */
export const inventoryImportRowSchema = z.object({
  type: inventoryTypeSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  province: z.string().trim().min(1).optional(),
  currency: z.string().trim().length(3).optional().default('EUR'),
  basePrice: z.coerce.number().nonnegative(),
});

export type InventoryImportRow = z.infer<typeof inventoryImportRowSchema>;

export const importUploadSchema = z.object({
  filename: z.string().trim().min(1),
  contentBase64: z.string().min(1),
});

export type ImportUploadRequest = z.infer<typeof importUploadSchema>;

export const commitImportSchema = z.object({
  mapping: z.record(z.string(), z.string()),
});

export type CommitImportRequest = z.infer<typeof commitImportSchema>;

export const importRowErrorSchema = z.object({
  row: z.number().int(),
  message: z.string(),
});

export const importPreviewSchema = z.object({
  batchId: z.string().uuid(),
  filename: z.string(),
  columns: z.array(z.string()),
  rowCount: z.number().int(),
  preview: z.array(z.record(z.string(), z.string())),
});

export type ImportPreviewDto = z.infer<typeof importPreviewSchema>;

export const importBatchSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  status: z.enum(['STAGED', 'COMMITTED', 'FAILED']),
  columns: z.array(z.string()),
  rowCount: z.number().int(),
  importedCount: z.number().int().nullable(),
  errors: z.array(importRowErrorSchema).nullable(),
  createdAt: z.string(),
});

export type ImportBatchDto = z.infer<typeof importBatchSchema>;

export const importCommitResultSchema = z.object({
  batchId: z.string().uuid(),
  importedCount: z.number().int(),
});

export type ImportCommitResultDto = z.infer<typeof importCommitResultSchema>;
