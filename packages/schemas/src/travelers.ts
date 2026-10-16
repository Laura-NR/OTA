import { z } from 'zod';

import { nationalitySchema } from './regulatory';

/**
 * M2 party and travelers (`docs/schema-m2-travelers.md`). The passport number
 * is never part of a list DTO: the party view only says whether one is on
 * file, and the plaintext comes from the audited vault route alone.
 */

export const travelerKindSchema = z.enum(['ADULT', 'CHILD', 'INFANT']);

export type TravelerKindDto = z.infer<typeof travelerKindSchema>;

export const priceLineKindSchema = z.enum([
  'BASE',
  'TIER',
  'CHILD',
  'SINGLE_SUPPLEMENT',
  'EXTRA',
  'SERVICE',
  'FEE',
]);

export type PriceLineKindDto = z.infer<typeof priceLineKindSchema>;

export const extraUnitSchema = z.enum(['PER_PERSON', 'PER_BOOKING']);

export const reservationTravelerSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  kind: travelerKindSchema,
  isLead: z.boolean(),
  fullName: z.string(),
  /** `YYYY-MM-DD`. */
  dateOfBirth: z.string().nullable(),
  nationality: z.string().nullable(),
  /** A passport number is stored (encrypted); read it through the vault route. */
  hasPassport: z.boolean(),
  /** `YYYY-MM-DD`. */
  passportExpiresAt: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  roomId: z.string().uuid().nullable(),
});

export type ReservationTravelerDto = z.infer<typeof reservationTravelerSchema>;

export const reservationRoomSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  capacity: z.number().int(),
  position: z.number().int(),
});

export type ReservationRoomDto = z.infer<typeof reservationRoomSchema>;

export const reservationExtraSchema = z.object({
  id: z.string().uuid(),
  /** The package extra it was priced from; null for a manual add-on. */
  packageExtraId: z.string().uuid().nullable(),
  label: z.string(),
  unit: extraUnitSchema,
  quantity: z.number().int(),
  unitAmount: z.string(),
  amount: z.string(),
  currency: z.string(),
});

export type ReservationExtraDto = z.infer<typeof reservationExtraSchema>;

/** Who travels on a booking, how they sleep, and what they added. */
export const reservationPartySchema = z.object({
  reservationId: z.string().uuid(),
  partySize: z.number().int(),
  tierId: z.string().uuid().nullable(),
  departureId: z.string().uuid().nullable(),
  /** A package booking is repriced from its party; a custom trip is not. */
  priced: z.boolean(),
  /** A payment link exists, so a change that moves the price is refused. */
  priceLocked: z.boolean(),
  rooms: z.array(reservationRoomSchema),
  travelers: z.array(reservationTravelerSchema),
  extras: z.array(reservationExtraSchema),
});

export type ReservationPartyDto = z.infer<typeof reservationPartySchema>;

export const priceLineSchema = z.object({
  id: z.string().uuid(),
  kind: priceLineKindSchema,
  label: z.string(),
  quantity: z.string(),
  unitAmount: z.string(),
  amount: z.string(),
  currency: z.string(),
  /** The traveler a per-person line is for (a child's rate); else null. */
  travelerId: z.string().uuid().nullable(),
  position: z.number().int(),
});

export type PriceLineDto = z.infer<typeof priceLineSchema>;

export const reservationPriceLinesSchema = z.object({
  reservationId: z.string().uuid(),
  currency: z.string(),
  /** The sum of the lines; the booking total once it is priced. */
  total: z.string(),
  lines: z.array(priceLineSchema),
});

export type ReservationPriceLinesDto = z.infer<typeof reservationPriceLinesSchema>;

/** The vault view: one traveler's passport, returned only by the audited route. */
export const travelerPassportSchema = z.object({
  travelerId: z.string().uuid(),
  passportNumber: z.string(),
  passportExpiresAt: z.string().nullable(),
});

export type TravelerPassportDto = z.infer<typeof travelerPassportSchema>;

/** Spaces and dashes are dropped and letters upper-cased before encryption. */
export const passportNumberSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
  .pipe(
    z.string().regex(/^[A-Z0-9]{5,20}$/, 'A passport number is 5–20 letters or digits'),
  );

export const travelerInputSchema = z
  .object({
    /** An existing traveler to update; omitted creates a new one. */
    id: z.string().uuid().optional(),
    kind: travelerKindSchema.default('ADULT'),
    isLead: z.boolean().default(false),
    fullName: z.string().trim().min(1).max(200),
    dateOfBirth: z.coerce.date().nullable().default(null),
    nationality: nationalitySchema.nullable().default(null),
    /**
     * Omitted keeps the stored number (the client never holds it); null
     * clears it; a value replaces it.
     */
    passportNumber: passportNumberSchema.nullable().optional(),
    passportExpiresAt: z.coerce.date().nullable().default(null),
    emergencyContactName: z.string().trim().max(200).nullable().default(null),
    emergencyContactPhone: z.string().trim().max(40).nullable().default(null),
    /** Index into the request's `rooms`; null leaves the traveler unassigned. */
    room: z.number().int().min(0).nullable().default(null),
  })
  .refine((traveler) => traveler.kind === 'ADULT' || traveler.dateOfBirth !== null, {
    message: 'A child or infant needs a date of birth to be priced',
    path: ['dateOfBirth'],
  });

export type TravelerInput = z.infer<typeof travelerInputSchema>;

export const roomInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(6).default(2),
});

/**
 * Replace a booking's party: the rooms and travelers are the whole list (a
 * traveler left out is removed), and a null tier or departure clears it.
 */
export const updateReservationPartySchema = z
  .object({
    tierId: z.string().uuid().nullable().default(null),
    departureId: z.string().uuid().nullable().default(null),
    rooms: z.array(roomInputSchema).max(30).default([]),
    travelers: z.array(travelerInputSchema).min(1).max(40),
  })
  .superRefine((party, context) => {
    if (party.travelers.filter((traveler) => traveler.isLead).length > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Only one traveler can be the lead',
        path: ['travelers'],
      });
    }

    const occupancy = new Map<number, number>();
    party.travelers.forEach((traveler, index) => {
      if (traveler.room === null) {
        return;
      }
      if (traveler.room >= party.rooms.length) {
        context.addIssue({
          code: 'custom',
          message: 'The traveler is assigned to a room that is not in the list',
          path: ['travelers', index, 'room'],
        });
        return;
      }
      occupancy.set(traveler.room, (occupancy.get(traveler.room) ?? 0) + 1);
    });
    for (const [room, count] of occupancy) {
      if (count > party.rooms[room]!.capacity) {
        context.addIssue({
          code: 'custom',
          message: 'More travelers than the room sleeps',
          path: ['rooms', room, 'capacity'],
        });
      }
    }

    const ids = party.travelers.flatMap((traveler) => (traveler.id ? [traveler.id] : []));
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'A traveler appears twice',
        path: ['travelers'],
      });
    }
  });

export type UpdateReservationPartyRequest = z.infer<typeof updateReservationPartySchema>;

/**
 * Add an extra to a package booking: either one of the package's extras
 * (priced from it) or a manual add-on with its own label and unit amount.
 */
export const addReservationExtraSchema = z.union([
  z.object({
    packageExtraId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(50).default(1),
  }),
  z.object({
    label: z.string().trim().min(1).max(120),
    unit: extraUnitSchema.default('PER_PERSON'),
    unitAmount: z.coerce.number().nonnegative().max(100_000),
    quantity: z.coerce.number().int().min(1).max(50).default(1),
  }),
]);

export type AddReservationExtraRequest = z.infer<typeof addReservationExtraSchema>;
