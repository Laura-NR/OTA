import { describe, expect, it } from 'vitest';

import { recordSupplierPayoutSchema, setPayoutMethodSchema } from '../src';

const ID = '7b0d7c3e-4f7a-4d63-9a1c-2f1f6a6d8e01';

describe('recording a payment (W-Earnings E1)', () => {
  it('takes the jobs, the method and a calendar day; the amount is never sent', () => {
    const parsed = recordSupplierPayoutSchema.parse({
      serviceItemIds: [ID],
      method: 'CASH_OFFICE',
      paidAt: '2026-10-10',
      amount: '9999.00',
    });
    expect(parsed).toEqual({
      serviceItemIds: [ID],
      method: 'CASH_OFFICE',
      paidAt: '2026-10-10',
    });
  });

  it('refuses no jobs, a job listed twice, an unknown method and a day that does not exist', () => {
    const valid = { serviceItemIds: [ID], method: 'CASH_OFFICE', paidAt: '2026-10-10' };
    expect(
      recordSupplierPayoutSchema.safeParse({ ...valid, serviceItemIds: [] }).success,
    ).toBe(false);
    expect(
      recordSupplierPayoutSchema.safeParse({ ...valid, serviceItemIds: [ID, ID] })
        .success,
    ).toBe(false);
    expect(
      recordSupplierPayoutSchema.safeParse({ ...valid, method: 'CHEQUE' }).success,
    ).toBe(false);
    expect(
      recordSupplierPayoutSchema.safeParse({ ...valid, paidAt: '2026-02-30' }).success,
    ).toBe(false);
  });
});

describe('the payout method (W-Earnings E2)', () => {
  it('is set or cleared by the desk', () => {
    expect(setPayoutMethodSchema.parse({ method: 'BANK_TRANSFER' }).method).toBe(
      'BANK_TRANSFER',
    );
    expect(setPayoutMethodSchema.parse({ method: null }).method).toBeNull();
    expect(setPayoutMethodSchema.safeParse({}).success).toBe(false);
  });
});
