import { describe, expect, it } from 'vitest';

import {
  proposalCanAccept,
  proposalEffectiveStatus,
  proposalLineAmount,
  proposalPartySize,
  proposalPerPerson,
  proposalToPriceLineKind,
  proposalTotal,
} from '../src';

describe('proposal line arithmetic', () => {
  it('rounds each line and sums the rounded amounts', () => {
    expect(proposalLineAmount(3, 100.125)).toBe(300.38);
    expect(proposalTotal([{ amount: 300.38 }, { amount: 0.1 }, { amount: 0.2 }])).toBe(
      300.68,
    );
  });

  it('divides the total by the party, and never by zero', () => {
    expect(proposalPartySize(2, 1)).toBe(3);
    expect(proposalPerPerson(5900, 2)).toBe(2950);
    expect(proposalPerPerson(5900, 0)).toBe(0);
  });
});

describe('proposal expiry', () => {
  const now = new Date('2026-10-20T12:00:00Z');

  it('derives EXPIRED from a sent version past its validity', () => {
    expect(proposalEffectiveStatus('SENT', new Date('2026-10-19T00:00:00Z'), now)).toBe(
      'EXPIRED',
    );
    expect(proposalCanAccept('SENT', new Date('2026-10-19T00:00:00Z'), now)).toBe(false);
  });

  it('keeps a version acceptable until its validity date', () => {
    expect(proposalEffectiveStatus('SENT', new Date('2026-10-21T00:00:00Z'), now)).toBe(
      'SENT',
    );
    expect(proposalCanAccept('SENT', new Date('2026-10-21T00:00:00Z'), now)).toBe(true);
  });

  it('does not turn accepted or declined proposals into expired ones', () => {
    expect(
      proposalEffectiveStatus('ACCEPTED', new Date('2026-10-19T00:00:00Z'), now),
    ).toBe('ACCEPTED');
    expect(
      proposalEffectiveStatus('DECLINED', new Date('2026-10-19T00:00:00Z'), now),
    ).toBe('DECLINED');
  });
});

describe('proposal to booking lines', () => {
  it('maps categories onto the booking price-line kinds', () => {
    expect(proposalToPriceLineKind('TRANSPORT')).toBe('SERVICE');
    expect(proposalToPriceLineKind('LODGING')).toBe('SERVICE');
    expect(proposalToPriceLineKind('GUIDES')).toBe('SERVICE');
    expect(proposalToPriceLineKind('ACTIVITIES')).toBe('SERVICE');
    expect(proposalToPriceLineKind('MEALS')).toBe('EXTRA');
    expect(proposalToPriceLineKind('INSURANCE')).toBe('EXTRA');
    expect(proposalToPriceLineKind('OTHER')).toBe('EXTRA');
    expect(proposalToPriceLineKind('FEE')).toBe('FEE');
  });
});
