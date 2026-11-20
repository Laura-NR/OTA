import {
  CREDENTIAL_KINDS,
  CREDENTIAL_STATUSES,
  type CredentialKind,
  type CredentialStatus,
} from '@ota/domain';
import { z } from 'zod';

import {
  calendarDaySchema,
  credentialContentTypeSchema,
  deskResourceChannelSchema,
  pendingVehicleSchema,
  resourceChannelSchema,
  vehicleRejectionSchema,
} from './supplier';

/** W-Credentials (`docs/schema-w-credentials.md`). */
export const credentialKindSchema = z.enum([...CREDENTIAL_KINDS] as [
  CredentialKind,
  ...CredentialKind[],
]);

export const credentialStatusSchema = z.enum([...CREDENTIAL_STATUSES] as [
  CredentialStatus,
  ...CredentialStatus[],
]);

export const credentialStateSchema = z.enum(['MISSING', 'VALID', 'EXPIRING', 'EXPIRED']);

/** One uploaded version of a document. */
export const credentialVersionSchema = z.object({
  id: z.string().uuid(),
  kind: credentialKindSchema,
  status: credentialStatusSchema,
  number: z.string().nullable(),
  issuer: z.string().nullable(),
  /** `YYYY-MM-DD`. */
  issuedOn: z.string().nullable(),
  /** `YYYY-MM-DD`, the last valid day. */
  expiresOn: z.string().nullable(),
  uploadedAt: z.string(),
  uploadedVia: resourceChannelSchema,
  reviewedAt: z.string().nullable(),
  /** The reviewer's first name, as the board's "Ernesto (central)". */
  reviewedByName: z.string().nullable(),
  rejectReason: z.string().nullable(),
  /** False for an identity card checked in person, and once a file is removed. */
  hasFile: z.boolean(),
  contentType: credentialContentTypeSchema.nullable(),
});

export type CredentialVersionDto = z.infer<typeof credentialVersionSchema>;

/** A required document: its state, when its pause starts, and its versions. */
export const credentialSlotSchema = z.object({
  kind: credentialKindSchema,
  state: credentialStateSchema,
  /** `YYYY-MM-DD`: auto-dispatch pauses from this day on, null without an expiry. */
  pauseFrom: z.string().nullable(),
  current: credentialVersionSchema.nullable(),
  pending: credentialVersionSchema.nullable(),
  rejected: credentialVersionSchema.nullable(),
});

export type CredentialSlotDto = z.infer<typeof credentialSlotSchema>;

/** The desk's document list on the supplier page. */
export const supplierCredentialsSchema = z.object({
  windowDays: z.number().int(),
  slots: z.array(credentialSlotSchema),
  /** Required documents with no verified version: the supplier cannot be approved. */
  missing: z.array(credentialKindSchema),
});

export type SupplierCredentialsDto = z.infer<typeof supplierCredentialsSchema>;

export const workerCredentialsSchema = z.object({
  summary: z.object({
    state: z.enum(['ACTIVE', 'IN_REVIEW', 'EXPIRING', 'SUSPENDED']),
    autoOffers: z.boolean(),
    nextExpiry: z
      .object({ kind: credentialKindSchema, expiresOn: z.string() })
      .nullable(),
  }),
  windowDays: z.number().int(),
  slots: z.array(credentialSlotSchema),
  /** The insurance card's vehicle line, for drivers with a vehicle on file. */
  vehicle: z
    .object({
      model: z.string(),
      plate: z.string(),
      seats: z.number().int(),
      airConditioning: z.boolean(),
    })
    .nullable(),
  /** The vehicle change waiting for the desk (`docs/schema-w-vehicle.md` X1a). */
  vehicleRequest: pendingVehicleSchema.nullable(),
  /** The last change the desk refused, until the worker asks again. */
  vehicleRejection: vehicleRejectionSchema.nullable(),
});

export type WorkerCredentialsDto = z.infer<typeof workerCredentialsSchema>;

const uploadFields = {
  kind: credentialKindSchema,
  filename: z.string().trim().min(1).max(255),
  contentType: credentialContentTypeSchema,
  contentBase64: z.string().min(1),
};

/** The desk uploads a document received by visit, phone or WhatsApp. */
export const uploadCredentialSchema = z.object({
  ...uploadFields,
  via: deskResourceChannelSchema,
});

export type UploadCredentialRequest = z.infer<typeof uploadCredentialSchema>;

/** The worker's photo from the app. */
export const workerUploadCredentialSchema = z.object(uploadFields);

export type WorkerUploadCredentialRequest = z.infer<typeof workerUploadCredentialSchema>;

const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null));

/** What the reviewer reads off the photo (V4a); which kinds need an expiry is the domain's. */
export const approveCredentialSchema = z.object({
  number: optionalLine(60),
  issuer: optionalLine(120),
  issuedOn: calendarDaySchema.nullable().default(null),
  expiresOn: calendarDaySchema.nullable().default(null),
});

export type ApproveCredentialRequest = z.infer<typeof approveCredentialSchema>;

/** A rejection, or "Request new upload": the reason tells the worker what to fix. */
export const rejectCredentialSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type RejectCredentialRequest = z.infer<typeof rejectCredentialSchema>;

/** The identity card checked in person (V5a): no photo, no number. */
export const checkIdentityCardSchema = z.object({
  via: deskResourceChannelSchema,
});

export type CheckIdentityCardRequest = z.infer<typeof checkIdentityCardSchema>;
