import { describe, expect, it } from 'vitest';

import { downloadStatus, receiptFileName } from '../src/lib/receipt';

describe('opening a payout receipt (W-Earnings E5)', () => {
  it('reads the refused status from the download error, so a 401 signs the worker out', () => {
    expect(downloadStatus(new Error('response has status: 401'))).toBe(401);
    expect(
      downloadStatus(new Error('Unable to download: response has status: 404')),
    ).toBe(404);
  });

  it('treats a download that never reached the API as no connection', () => {
    expect(downloadStatus(new Error('Unable to resolve host "api.test"'))).toBeNull();
    expect(downloadStatus('timeout')).toBeNull();
  });

  it('keeps the API’s receipt name, or falls back to a plain one', () => {
    expect(receiptFileName('inline; filename="recibo-PG-5D3C2B1A.pdf"')).toBe(
      'recibo-PG-5D3C2B1A.pdf',
    );
    expect(receiptFileName(null)).toBe('recibo.pdf');
    expect(receiptFileName('inline')).toBe('recibo.pdf');
  });
});
