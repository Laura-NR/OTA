import {
  DESK_RESOURCE_CHANNELS,
  GENERATOR_ACCESS,
  PAYOUT_METHODS,
  POWER_KINDS,
  RESOURCE_CHANNELS,
  ServiceType,
  SupplierCategory,
  VerificationStatus,
  WORKER_BLOCK_REASONS,
  type GeneratorAccess,
  type PayoutMethod,
  type PowerKind,
  type ResourceChannel,
  type WorkerBlockReason,
} from '@ota/domain';
import { z } from 'zod';

/** A calendar day, `YYYY-MM-DD`, that exists (no 30 February). */
export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (day) => new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day,
    'Not a calendar day',
  );

export const supplierCategorySchema = z.enum([
  SupplierCategory.TourGuide,
  SupplierCategory.PrivateDriver,
  SupplierCategory.HomestayHost,
  SupplierCategory.Translator,
]);

export const verificationStatusSchema = z.enum([
  VerificationStatus.PendingAudit,
  VerificationStatus.Verified,
  VerificationStatus.Rejected,
  VerificationStatus.Suspended,
]);

export const listSuppliersQuerySchema = z.object({
  status: verificationStatusSchema.optional(),
  province: z.string().trim().min(1).optional(),
  /** `1` keeps casas with solar or a generator and drivers with fuel (M6 D1). */
  backupPower: z
    .enum(['0', '1'])
    .transform((value) => value === '1')
    .optional(),
});

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

export const setVerificationSchema = z.object({
  status: verificationStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export type SetVerificationRequest = z.infer<typeof setVerificationSchema>;

export const supplierSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string().nullable(),
  email: z.string().email(),
  category: supplierCategorySchema,
  primaryPhone: z.string(),
  provincesActive: z.array(z.string()),
  rtnLicenseNumber: z.string(),
  verificationStatus: verificationStatusSchema,
  isAvailable: z.boolean(),
  credentialExpiresAt: z.string().nullable(),
  hasCredential: z.boolean(),
  credentialContentType: z.string().nullable(),
});

export type SupplierDto = z.infer<typeof supplierSchema>;

/** Credential images are shown inline; PDFs are linked. Kept in sync with the
 * key extension so the DTO can report the type without a schema column. */
export const credentialContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const uploadCredentialSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: credentialContentTypeSchema,
  contentBase64: z.string().min(1),
  expiresAt: z.coerce.date().optional(),
});

export type UploadCredentialRequest = z.infer<typeof uploadCredentialSchema>;

export const expiringSuppliersQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type ExpiringSuppliersQuery = z.infer<typeof expiringSuppliersQuerySchema>;

/** Availability calendar window (spec §5.2). Bounds are inclusive. */
export const availabilityQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

/** Why a worker blocked a day (W-Calendar's "Motivo" chips). */
export const blockReasonSchema = z.enum([...WORKER_BLOCK_REASONS] as [
  WorkerBlockReason,
  ...WorkerBlockReason[],
]);

export const availabilityDaySchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  date: z.string(),
  isAvailable: z.boolean(),
  /** Null when available, blocked by the desk, or blocked before the reasons existed. */
  blockReason: blockReasonSchema.nullable(),
});

export type AvailabilityDayDto = z.infer<typeof availabilityDaySchema>;

export const setAvailabilitySchema = z.object({
  date: z.coerce.date(),
  isAvailable: z.boolean(),
});

export type SetAvailabilityRequest = z.infer<typeof setAvailabilitySchema>;

/**
 * More than fourteen blocked days in a row from today on (W-Calendar): the
 * desk marks the worker inactive and calls them before high season.
 */
export const blockedRunSchema = z.object({
  from: z.string(),
  to: z.string(),
  days: z.number().int(),
});

export type BlockedRunDto = z.infer<typeof blockedRunSchema>;

/* M6 supplier resources (`docs/schema-m6-suppliers.md`). */

export const generatorAccessSchema = z.enum([...GENERATOR_ACCESS] as [
  GeneratorAccess,
  ...GeneratorAccess[],
]);

export const resourceChannelSchema = z.enum([...RESOURCE_CHANNELS] as [
  ResourceChannel,
  ...ResourceChannel[],
]);

/** The desk records phone, WhatsApp and visit confirmations (D4). */
export const deskResourceChannelSchema = z.enum(DESK_RESOURCE_CHANNELS);

const SMALLINT_MAX = 32_767;
const INT_MAX = 2_147_483_647;

const amount = (max: number) => z.number().int().min(0).max(max).nullable().default(null);

/**
 * One confirmation: the whole row is replaced, and an omitted field is stored
 * as null. The bounds match the columns and their CHECK constraints; which
 * fields a category may carry is the domain `resourcesIssue`.
 */
export const confirmResourcesSchema = z.object({
  via: deskResourceChannelSchema,
  generator: generatorAccessSchema.nullable().default(null),
  generatorHoursPerDay: amount(24),
  generatorSchedule: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null)),
  generatorFuelDays: amount(SMALLINT_MAX),
  /** Kept to one decimal, as the column stores it. */
  solarBatteryKwh: z
    .number()
    .min(0)
    .max(9999.9)
    .nullable()
    .default(null)
    .transform((value) => (value === null ? null : Math.round(value * 10) / 10)),
  waterTankLitres: amount(INT_MAX),
  rooms: amount(SMALLINT_MAX),
  guestCapacity: amount(SMALLINT_MAX),
  fuelReserveLitres: amount(INT_MAX),
});

export type ConfirmResourcesRequest = z.infer<typeof confirmResourcesSchema>;

export const supplierResourcesSchema = z.object({
  generator: generatorAccessSchema.nullable(),
  generatorHoursPerDay: z.number().int().nullable(),
  generatorSchedule: z.string().nullable(),
  generatorFuelDays: z.number().int().nullable(),
  solarBatteryKwh: z.number().nullable(),
  waterTankLitres: z.number().int().nullable(),
  rooms: z.number().int().nullable(),
  guestCapacity: z.number().int().nullable(),
  fuelReserveLitres: z.number().int().nullable(),
  confirmedAt: z.string(),
  confirmedByName: z.string().nullable(),
  confirmedVia: resourceChannelSchema,
  /** Older than seven days (D2), derived on read. */
  stale: z.boolean(),
});

export type SupplierResourcesDto = z.infer<typeof supplierResourcesSchema>;

export const supplierPowerSchema = z.object({
  kind: z.enum([...POWER_KINDS] as [PowerKind, ...PowerKind[]]),
  hoursPerDay: z.number().int().nullable(),
  litres: z.number().int().nullable(),
  /** Passes the "Backup power only" filter. */
  backup: z.boolean(),
  confirmedAt: z.string().nullable(),
  stale: z.boolean(),
});

export type SupplierPowerDto = z.infer<typeof supplierPowerSchema>;

/** The latest job (D3): a service item, not a route, which is stored nowhere. */
export const supplierLastJobSchema = z.object({
  startsAt: z.string(),
  serviceType: z.enum([
    ServiceType.Guide,
    ServiceType.Transportation,
    ServiceType.Accommodation,
    ServiceType.Experience,
  ]),
  province: z.string().nullable(),
});

export type SupplierLastJobDto = z.infer<typeof supplierLastJobSchema>;

/** A register row: the supplier with its Power and Last job columns. */
export const supplierRowSchema = supplierSchema.extend({
  power: supplierPowerSchema,
  lastJob: supplierLastJobSchema.nullable(),
});

export type SupplierRowDto = z.infer<typeof supplierRowSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null));

/**
 * A driver's vehicle (M6 D7(b)), stored in the profile's `vehicle_details`
 * JSON: the whole object is replaced on each save.
 */
export const vehicleDetailsInputSchema = z.object({
  model: z.string().trim().min(1).max(80),
  seats: z.number().int().min(1).max(60),
  airConditioning: z.boolean(),
  /** "Child seat on request". */
  extras: optionalText(120),
  plate: z.string().trim().min(1).max(20),
  /** The cover as the policy names it ("Civil liability"). */
  insurance: optionalText(80),
  insuranceUntil: z.coerce.date().nullable().default(null),
  routes: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
});

export type VehicleDetailsRequest = z.infer<typeof vehicleDetailsInputSchema>;

export const vehicleDetailsSchema = z.object({
  model: z.string(),
  seats: z.number().int(),
  airConditioning: z.boolean(),
  extras: z.string().nullable(),
  plate: z.string(),
  insurance: z.string().nullable(),
  /** `YYYY-MM-DD`. */
  insuranceUntil: z.string().nullable(),
  routes: z.array(z.string()),
});

export type VehicleDetailsDto = z.infer<typeof vehicleDetailsSchema>;

/** A sum of payouts, as a decimal string, and the finished jobs it covers. */
export const payoutTotalSchema = z.object({
  amount: z.string(),
  jobs: z.number().int(),
});

export type PayoutTotalDto = z.infer<typeof payoutTotalSchema>;

/** How a worker is paid (`docs/schema-w-earnings.md` E2). */
export const payoutMethodSchema = z.enum([...PAYOUT_METHODS] as [
  PayoutMethod,
  ...PayoutMethod[],
]);

/**
 * A worker's payouts over their finished jobs (W-Earnings), the same figures
 * on the desk's inspector and in the worker app.
 */
export const supplierPayoutsSchema = z.object({
  currency: z.string(),
  /** Finished, not yet paid. */
  pending: payoutTotalSchema,
  /** Finished this month in Havana, whatever the payout state. */
  thisMonth: payoutTotalSchema,
  /** Paid this year, by the day of the payment. */
  paidThisYear: payoutTotalSchema,
  /** Payouts that failed. */
  issue: payoutTotalSchema,
  year: z.number().int(),
  /** The worker's method; null until the desk sets it (E2). */
  method: payoutMethodSchema.nullable(),
  /** Where cash is collected, from the tenant manifest. */
  office: z.string().nullable(),
  /** Business days after a job ends before it is paid (E4). */
  businessDays: z.number().int(),
  /** The next office session that pays a pending job; null when none (E4). */
  nextPayDay: z.object({ day: z.string(), from: z.string(), to: z.string() }).nullable(),
});

export type SupplierPayoutsDto = z.infer<typeof supplierPayoutsSchema>;

/**
 * The inspector: the row plus the confirmed resources, the 12-month count,
 * a driver's vehicle (null when none is stored or the stored JSON does not
 * match the shape) and the worker's payouts.
 */
export const supplierDetailSchema = supplierRowSchema.extend({
  resources: supplierResourcesSchema.nullable(),
  jobs12m: z.number().int(),
  vehicle: vehicleDetailsSchema.nullable(),
  longBlock: blockedRunSchema.nullable(),
  payouts: supplierPayoutsSchema,
});

export type SupplierDetailDto = z.infer<typeof supplierDetailSchema>;
