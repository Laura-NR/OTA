import {
  WORKER_DAY_STATES,
  WORKER_PAYOUT_STATES,
  type WorkerDayState,
  type WorkerPayoutState,
} from '@ota/domain';
import { z } from 'zod';

import { serviceTypeSchema } from './dispatch';
import {
  blockReasonSchema,
  blockedRunSchema,
  supplierCategorySchema,
  supplierPayoutsSchema,
  verificationStatusSchema,
} from './supplier';

/**
 * What the worker app may show about the travelers (W-Login: "Solo ves el
 * nombre, el idioma y …"): a first name, the language and the party size.
 * Never an address, an email or a payment.
 */
export const workerTravelerSchema = z.object({
  firstName: z.string().nullable(),
  /** The traveler's locale, such as `en`. */
  language: z.string(),
  partySize: z.number().int(),
});

/** A job as the worker app shows it: one service item of theirs. */
export const workerJobSchema = z.object({
  serviceItemId: z.string().uuid(),
  serviceType: serviceTypeSchema,
  province: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  bookingCode: z.string(),
  /** The worker's payout in the base currency, as a decimal string. */
  payout: z.string(),
  currency: z.string(),
  traveler: workerTravelerSchema,
});

export type WorkerJobDto = z.infer<typeof workerJobSchema>;

/** An open offer (W-Offer): the job plus its answer window. */
export const workerOfferSchema = workerJobSchema.extend({
  offeredAt: z.string(),
  deadline: z.string(),
  /** When less than a quarter of the window is left, by default (the desk's amber). */
  hurryFrom: z.string(),
});

export type WorkerOfferDto = z.infer<typeof workerOfferSchema>;

/** W-Home: the worker, their open offers and their coming jobs. */
export const workerHomeSchema = z.object({
  worker: z.object({
    firstName: z.string().nullable(),
    category: supplierCategorySchema,
    provinces: z.array(z.string()),
    verificationStatus: verificationStatusSchema,
    credentialExpiresAt: z.string().nullable(),
    /** Accepted over answered offers, 0–100; null before five answers. */
    reliability: z.number().int().nullable(),
  }),
  offers: z.array(workerOfferSchema),
  jobs: z.array(workerJobSchema),
  /** The API's clock, so the app counts down without trusting the phone's. */
  serverTime: z.string(),
});

export type WorkerHomeDto = z.infer<typeof workerHomeSchema>;

/** A sign-in code the desk issued to read out to a worker (W1). */
export const workerSignInCodeSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
  /** The number the worker types, with two digits hidden. */
  phone: z.string(),
});

export type WorkerSignInCodeDto = z.infer<typeof workerSignInCodeSchema>;

/** What the desk's "Sign out of the worker app" ended. */
export const workerSignOutSchema = z.object({
  /** The phones that were signed in as this worker and now are not. */
  sessions: z.number().int(),
});

export type WorkerSignOutDto = z.infer<typeof workerSignOutSchema>;

/** A calendar day, `YYYY-MM-DD`, that exists (no 30 February). */
const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (day) => new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day,
    'Not a calendar day',
  );

export const workerDayStateSchema = z.enum([...WORKER_DAY_STATES] as [
  WorkerDayState,
  ...WorkerDayState[],
]);

/** W-Calendar's month, `YYYY-MM`; the current month in Havana when absent. */
export const workerCalendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export type WorkerCalendarQuery = z.infer<typeof workerCalendarQuerySchema>;

/** A driver's fuel reserve as the worker last declared it, or the desk confirmed it. */
export const workerFuelSchema = z.object({
  litres: z.number().int().nullable(),
  /** When it was last declared or confirmed; null when never. */
  declaredAt: z.string().nullable(),
  /** Older than the desk's staleness threshold: time to declare again. */
  stale: z.boolean(),
});

export type WorkerFuelDto = z.infer<typeof workerFuelSchema>;

/** W-Calendar: one month of the worker's days and what is on them. */
export const workerCalendarSchema = z.object({
  month: z.string(),
  /** Today in Havana; days before it cannot be changed. */
  today: z.string(),
  /** The last day the worker may change. */
  horizon: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      state: workerDayStateSchema,
      /** A blocked day's reason; null on any other state, or when none was given. */
      reason: blockReasonSchema.nullable(),
    }),
  ),
  /** Jobs taken (accepted or done) that touch the month. */
  jobs: z.array(workerJobSchema),
  /** Offers still open that touch the month. */
  offers: z.array(workerOfferSchema),
  longBlock: blockedRunSchema.nullable(),
  /** Drivers only (null for other categories). */
  fuel: workerFuelSchema.nullable(),
});

export type WorkerCalendarDto = z.infer<typeof workerCalendarSchema>;

/** "Bloquear este día", "Bloquear varios días" or "Volver a estar disponible". */
export const setWorkerDaysSchema = z.object({
  from: calendarDaySchema,
  to: calendarDaySchema,
  isAvailable: z.boolean(),
  /** Blocking only: "Otro" when absent; ignored when the days are freed. */
  reason: blockReasonSchema.optional(),
});

export type SetWorkerDaysRequest = z.infer<typeof setWorkerDaysSchema>;

export const workerDaysResultSchema = z.object({
  /** The days now set as asked. */
  changed: z.array(z.string()),
  /** Days with a job or an open offer, left as they were. */
  kept: z.array(z.string()),
  longBlock: blockedRunSchema.nullable(),
});

export type WorkerDaysResultDto = z.infer<typeof workerDaysResultSchema>;

/** W-Calendar's "Combustible en reserva": litres, declared by a driver. */
export const declareWorkerFuelSchema = z.object({
  /** The column's bound, as the desk's form has it. */
  litres: z.number().int().min(0).max(2_147_483_647),
});

export type DeclareWorkerFuelRequest = z.infer<typeof declareWorkerFuelSchema>;

export const workerPayoutStateSchema = z.enum([...WORKER_PAYOUT_STATES] as [
  WorkerPayoutState,
  ...WorkerPayoutState[],
]);

/** A finished job in W-Earnings' "Historial", with where its payout stands. */
export const workerEarningsJobSchema = workerJobSchema.extend({
  payoutState: workerPayoutStateSchema,
});

export type WorkerEarningsJobDto = z.infer<typeof workerEarningsJobSchema>;

/**
 * W-Earnings, read-only: who the worker is, their reliability as the desk's
 * floor reads it, their payouts and their latest finished jobs.
 */
export const workerEarningsSchema = z.object({
  worker: z.object({
    fullName: z.string().nullable(),
    category: supplierCategorySchema,
    provinces: z.array(z.string()),
  }),
  reliability: z.object({
    answered: z.number().int(),
    /** Accepted over answered, 0–100; null until `minAnswered` answers. */
    score: z.number().int().nullable(),
    acceptedPercent: z.number().int(),
    declinedPercent: z.number().int(),
    timedOutPercent: z.number().int(),
    minAnswered: z.number().int(),
    floorPercent: z.number(),
    meetsFloor: z.boolean(),
  }),
  payouts: supplierPayoutsSchema,
  history: z.array(workerEarningsJobSchema),
});

export type WorkerEarningsDto = z.infer<typeof workerEarningsSchema>;
