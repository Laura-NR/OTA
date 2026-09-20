import { DocumentType } from '@ota/domain';
import { z } from 'zod';

export const documentTypeSchema = z.enum([
  DocumentType.Voucher,
  DocumentType.WorkOrder,
  DocumentType.Invoice,
  DocumentType.Receipt,
  DocumentType.EmergencyContact,
]);

export const documentSchema = z.object({
  id: z.string().uuid(),
  type: documentTypeSchema,
  storageKey: z.string(),
  generatedAt: z.string(),
});

export type DocumentDto = z.infer<typeof documentSchema>;
