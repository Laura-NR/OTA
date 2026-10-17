/**
 * M5 custom-trip proposals (`docs/schema-m5-proposal.md`). The rules stay pure:
 * the API stores the request, the desk's priced versions and the traveler's
 * acceptance; these helpers decide line arithmetic, party size, expiry and the
 * mapping of proposal lines onto the booking's frozen price lines.
 */

export const PROPOSAL_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_LINE_KINDS = [
  'TRANSPORT',
  'LODGING',
  'GUIDES',
  'ACTIVITIES',
  'MEALS',
  'INSURANCE',
  'FEE',
  'OTHER',
] as const;

export type ProposalLineKind = (typeof PROPOSAL_LINE_KINDS)[number];

export const PROPOSAL_LINE_UNITS = [
  'PER_PERSON',
  'PER_BOOKING',
  'PER_NIGHT',
  'PER_DAY',
  'PER_GROUP',
] as const;

export type ProposalLineUnit = (typeof PROPOSAL_LINE_UNITS)[number];

export type ReservationPriceLineKind = 'SERVICE' | 'FEE' | 'EXTRA';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A line's amount is its unit price times its quantity, rounded to the cent. */
export function proposalLineAmount(quantity: number, unitAmount: number): number {
  return round2(quantity * unitAmount);
}

/** The sum of the version's lines; the invoice and the proposal agree by construction. */
export function proposalTotal(lines: readonly { amount: number }[]): number {
  return round2(lines.reduce((sum, line) => sum + line.amount, 0));
}

/** The per-person figure printed on the D-Proposal; 0 when the party is empty. */
export function proposalPerPerson(total: number, partySize: number): number {
  return partySize > 0 ? round2(total / partySize) : 0;
}

export function proposalPartySize(adults: number, children: number): number {
  return Math.max(0, adults) + Math.max(0, children);
}

/**
 * A sent version stops being acceptable at `validUntil`; the status is derived
 * on read so no scheduled job has to mutate the proposal.
 */
export function proposalEffectiveStatus(
  status: string,
  validUntil: Date,
  now: Date,
): ProposalStatus {
  if (status === 'SENT' && validUntil.getTime() < now.getTime()) {
    return 'EXPIRED';
  }
  return status as ProposalStatus;
}

export function proposalCanAccept(status: string, validUntil: Date, now: Date): boolean {
  return proposalEffectiveStatus(status, validUntil, now) === 'SENT';
}

/**
 * Proposal categories become booking price lines: bookable services are
 * SERVICE, the fee is FEE, and meals, insurance and other costs are EXTRA.
 */
export function proposalToPriceLineKind(
  kind: ProposalLineKind,
): ReservationPriceLineKind {
  if (kind === 'FEE') {
    return 'FEE';
  }
  if (kind === 'MEALS' || kind === 'INSURANCE' || kind === 'OTHER') {
    return 'EXTRA';
  }
  return 'SERVICE';
}
