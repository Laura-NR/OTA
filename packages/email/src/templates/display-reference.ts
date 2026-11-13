/**
 * M9 display currencies (`docs/schema-m9-display-currencies.md` C7b): the
 * "about CA$ …" guide an email shows beside its EUR amounts. The API converts
 * each amount, rounded up to the whole unit, at the booking's locked rate or
 * else at today's; every charge stays in EUR.
 */
export interface DisplayReference {
  currency: string;
  /** When the booking's rate was locked; null while today's rate is shown. */
  lockedAt: Date | null;
  /** The threshold's lock point (C6a), for the "the rate locks when …" words. */
  lockAt: 'DEPOSIT' | 'INVOICE';
}
