/**
 * The custom builder's running estimate (Custom board's side panel): an
 * orientation range per person from the agency's sample rates, never a
 * price. The desk's proposal is the price.
 */

export type GuidingChoice = 'none' | 'shared' | 'private';

export const GUIDING_CHOICES: readonly GuidingChoice[] = ['none', 'shared', 'private'];

/** The builder's pace choices; their words live in the message catalogs. */
export const BUILDER_PACES = ['gentle', 'moderate', 'active'] as const;

/** The builder's interests (Custom board), stored on the request by key. */
export const BUILDER_INTERESTS = [
  'nature',
  'farm',
  'music',
  'food',
  'architecture',
  'afro',
  'beach',
  'diving',
] as const;

export interface EstimateRates {
  transportPerPersonDay: number;
  sharedGuidePerPersonDay: number;
  privateGuidePerGroupDay: number;
  interpreterPerGroupDay: number;
  offsetPerNight: number;
  feePercent: number;
  spreadPercent: number;
}

export interface EstimateInput {
  /** Each stop's nights and the chosen stay style's rate per person per night. */
  stops: readonly { nights: number; stayPerNight: number }[];
  /** The chosen activities' prices per person. */
  activities: readonly number[];
  guiding: GuidingChoice;
  interpreter: boolean;
  partySize: number;
  rates: EstimateRates;
}

export interface TripEstimate {
  nights: number;
  /** Days on the ground: one more than the nights. */
  days: number;
  stays: number;
  transport: number;
  activities: number;
  guides: number;
  offset: number;
  fee: number;
  total: number;
  /** The range shown to the traveler, in whole currency units. */
  low: number;
  high: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/**
 * Per person: stays by the night, transport by the day, each activity once,
 * a shared guide on activity days or a private one for every day (split over
 * the party), an interpreter on the days without an activity, the carbon
 * offset by the night, and the agency fee on all of it.
 */
export function customTripEstimate(input: EstimateInput): TripEstimate {
  const { rates } = input;
  const party = Math.max(1, input.partySize);
  const nights = input.stops.reduce((sum, stop) => sum + stop.nights, 0);
  const days = nights > 0 ? nights + 1 : 0;
  const activityDays = input.activities.length;

  const stays = input.stops.reduce(
    (sum, stop) => sum + stop.nights * stop.stayPerNight,
    0,
  );
  const transport = rates.transportPerPersonDay * days;
  const activities = input.activities.reduce((sum, price) => sum + price, 0);
  const guiding =
    input.guiding === 'shared'
      ? rates.sharedGuidePerPersonDay * activityDays
      : input.guiding === 'private'
        ? (rates.privateGuidePerGroupDay * days) / party
        : 0;
  const interpreter = input.interpreter
    ? (rates.interpreterPerGroupDay * Math.max(0, days - activityDays)) / party
    : 0;
  const guides = guiding + interpreter;
  const offset = rates.offsetPerNight * nights;
  const subtotal = stays + transport + activities + guides + offset;
  const fee = (subtotal * rates.feePercent) / 100;
  const total = subtotal + fee;
  const spread = rates.spreadPercent / 100;

  return {
    nights,
    days,
    stays: cents(stays),
    transport: cents(transport),
    activities: cents(activities),
    guides: cents(guides),
    offset: cents(offset),
    fee: cents(fee),
    total: cents(total),
    low: Math.floor(total * (1 - spread)),
    high: Math.ceil(total * (1 + spread)),
  };
}
