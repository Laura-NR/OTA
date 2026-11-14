import { describe, expect, it } from 'vitest';

import {
  SupplierCategory,
  VerificationStatus,
  credentialApprovalRefusal,
  credentialPauseFrom,
  credentialReviewSms,
  credentialSlots,
  credentialState,
  credentialSummary,
  credentialUploadRefusal,
  currentCredentialExpiry,
  missingCredentials,
  type CredentialKind,
  type CredentialStatus,
  type CredentialVersion,
} from '../src';

const NOW = new Date('2026-10-06T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

interface Row extends CredentialVersion {
  id: string;
}

let next = 0;
function row(
  kind: CredentialKind,
  status: CredentialStatus,
  expiresOn: string | null,
  uploadedAt = '2026-01-15',
): Row {
  next += 1;
  return {
    id: `v${next}`,
    kind,
    status,
    expiresOn: expiresOn ? day(expiresOn) : null,
    uploadedAt: day(uploadedAt),
  };
}

/** The board's driver: licence with a renewal under review, inspection due 30 nov, insurance, ID. */
const driver: Row[] = [
  row('TRANSPORT_LICENCE', 'SUPERSEDED', '2025-06-12', '2024-06-01'),
  row('TRANSPORT_LICENCE', 'VERIFIED', '2027-06-12', '2025-06-10'),
  row('TRANSPORT_LICENCE', 'PENDING_AUDIT', null, '2026-10-05'),
  row('TECHNICAL_INSPECTION', 'VERIFIED', '2026-11-30'),
  row('LIABILITY_INSURANCE', 'VERIFIED', '2027-01-31'),
  row('IDENTITY_CARD', 'VERIFIED', null),
];

describe('credentialUploadRefusal', () => {
  it('lets a driver upload each of the four documents but the identity card', () => {
    expect(
      credentialUploadRefusal(SupplierCategory.PrivateDriver, 'TRANSPORT_LICENCE'),
    ).toBe(null);
    expect(
      credentialUploadRefusal(SupplierCategory.PrivateDriver, 'LIABILITY_INSURANCE'),
    ).toBe(null);
  });

  it('refuses a photo of the identity card, which is checked in person (V5a)', () => {
    expect(credentialUploadRefusal(SupplierCategory.PrivateDriver, 'IDENTITY_CARD')).toBe(
      'NO_FILE_KIND',
    );
  });

  it('refuses a document the category does not need', () => {
    expect(
      credentialUploadRefusal(SupplierCategory.HomestayHost, 'TRANSPORT_LICENCE'),
    ).toBe('NOT_REQUIRED');
  });
});

describe('credentialSlots', () => {
  it('lists the category’s documents in order with current and pending versions', () => {
    const slots = credentialSlots(SupplierCategory.PrivateDriver, driver);

    expect(slots.map((slot) => slot.kind)).toEqual([
      'TRANSPORT_LICENCE',
      'TECHNICAL_INSPECTION',
      'LIABILITY_INSURANCE',
      'IDENTITY_CARD',
    ]);
    expect(slots[0]!.current?.expiresOn).toEqual(day('2027-06-12'));
    expect(slots[0]!.pending?.uploadedAt).toEqual(day('2026-10-05'));
    expect(slots[1]!.pending).toBeNull();
  });

  it('shows a rejection only until something newer is uploaded', () => {
    const rejected = row('GUIDE_LICENCE', 'REJECTED', null, '2026-10-01');
    expect(credentialSlots(SupplierCategory.TourGuide, [rejected])[0]!.rejected?.id).toBe(
      rejected.id,
    );

    const retried = row('GUIDE_LICENCE', 'PENDING_AUDIT', null, '2026-10-02');
    expect(
      credentialSlots(SupplierCategory.TourGuide, [rejected, retried])[0]!.rejected,
    ).toBeNull();
  });

  it('leaves a kind with no version empty', () => {
    const [licence] = credentialSlots(SupplierCategory.HomestayHost, []);
    expect(licence).toEqual({
      kind: 'HOST_LICENCE',
      current: null,
      pending: null,
      rejected: null,
    });
  });
});

describe('currentCredentialExpiry', () => {
  it('is the earliest expiry among verified versions (V3a)', () => {
    expect(currentCredentialExpiry(driver)).toEqual(day('2026-11-30'));
  });

  it('ignores superseded, pending and rejected versions', () => {
    expect(
      currentCredentialExpiry([
        row('TRANSPORT_LICENCE', 'SUPERSEDED', '2026-01-01'),
        row('TRANSPORT_LICENCE', 'REJECTED', '2026-02-01'),
        row('TRANSPORT_LICENCE', 'PENDING_AUDIT', '2026-03-01'),
      ]),
    ).toBeNull();
  });

  it('is null when only the identity card is verified', () => {
    expect(currentCredentialExpiry([row('IDENTITY_CARD', 'VERIFIED', null)])).toBeNull();
  });
});

describe('missingCredentials', () => {
  it('names the required documents with no verified version', () => {
    expect(
      missingCredentials(SupplierCategory.PrivateDriver, [
        row('TRANSPORT_LICENCE', 'VERIFIED', '2027-06-12'),
        row('LIABILITY_INSURANCE', 'PENDING_AUDIT', null),
      ]),
    ).toEqual(['TECHNICAL_INSPECTION', 'LIABILITY_INSURANCE', 'IDENTITY_CARD']);
  });

  it('is empty for a complete driver', () => {
    expect(missingCredentials(SupplierCategory.PrivateDriver, driver)).toEqual([]);
  });
});

describe('credentialState', () => {
  it('is valid through the expiry day and expired the day after', () => {
    const lastDay = { expiresOn: day('2026-10-06') };
    expect(credentialState(lastDay, NOW, 30)).toBe('EXPIRING');
    expect(credentialState(lastDay, new Date('2026-10-07T00:00:00Z'), 30)).toBe(
      'EXPIRED',
    );
  });

  it('pauses from the window on', () => {
    expect(credentialState({ expiresOn: day('2026-11-04') }, NOW, 30)).toBe('EXPIRING');
    expect(credentialState({ expiresOn: day('2026-11-30') }, NOW, 30)).toBe('VALID');
  });

  it('reads a document without expiry as valid, and none as missing', () => {
    expect(credentialState({ expiresOn: null }, NOW)).toBe('VALID');
    expect(credentialState(null, NOW)).toBe('MISSING');
  });
});

describe('credentialPauseFrom', () => {
  it('is the window before the expiry: "Desde el 31 oct (30 días antes)"', () => {
    expect(credentialPauseFrom(day('2026-11-30'), 30)).toEqual(day('2026-10-31'));
  });
});

describe('credentialSummary', () => {
  const verified = VerificationStatus.Verified;

  it('stays active with a renewal under review beside a valid document', () => {
    const slots = credentialSlots(SupplierCategory.PrivateDriver, driver);
    expect(credentialSummary(verified, slots, NOW, 30)).toEqual({
      state: 'ACTIVE',
      autoOffers: true,
      nextExpiry: { kind: 'TECHNICAL_INSPECTION', expiresOn: day('2026-11-30') },
    });
  });

  it('is expiring soon, without auto offers, inside the window', () => {
    const slots = credentialSlots(SupplierCategory.PrivateDriver, driver);
    const summary = credentialSummary(verified, slots, day('2026-11-01'), 30);
    expect(summary.state).toBe('EXPIRING');
    expect(summary.autoOffers).toBe(false);
  });

  it('is in review when the upload that lifts the pause waits for the desk', () => {
    const slots = credentialSlots(SupplierCategory.PrivateDriver, [
      ...driver,
      row('TECHNICAL_INSPECTION', 'PENDING_AUDIT', null, '2026-11-02'),
    ]);
    const summary = credentialSummary(verified, slots, day('2026-11-03'), 30);
    expect(summary.state).toBe('IN_REVIEW');
    expect(summary.autoOffers).toBe(false);
  });

  it('is suspended once a document has expired', () => {
    const slots = credentialSlots(SupplierCategory.PrivateDriver, driver);
    expect(credentialSummary(verified, slots, day('2026-12-01'), 30).state).toBe(
      'SUSPENDED',
    );
  });

  it('follows the desk: suspended or rejected suppliers, and the first audit', () => {
    const slots = credentialSlots(SupplierCategory.PrivateDriver, driver);
    expect(credentialSummary(VerificationStatus.Suspended, slots, NOW).state).toBe(
      'SUSPENDED',
    );
    expect(credentialSummary(VerificationStatus.Rejected, slots, NOW).state).toBe(
      'SUSPENDED',
    );
    const audit = credentialSummary(VerificationStatus.PendingAudit, slots, NOW);
    expect(audit.state).toBe('IN_REVIEW');
    expect(audit.autoOffers).toBe(false);
  });

  it('keeps a supplier verified before W-Credentials active with a missing document (V3a)', () => {
    const slots = credentialSlots(SupplierCategory.TourGuide, [
      row('GUIDE_LICENCE', 'VERIFIED', '2027-12-31'),
    ]);
    expect(credentialSummary(verified, slots, NOW).state).toBe('ACTIVE');
  });
});

describe('credentialApprovalRefusal', () => {
  const pending = {
    kind: 'TRANSPORT_LICENCE' as const,
    status: 'PENDING_AUDIT' as const,
  };
  const approval = {
    number: 'LOT-HAB-2026-00001',
    issuer: null,
    issuedOn: day('2026-10-01'),
    expiresOn: day('2028-10-01'),
  };

  it('approves a pending document with a future expiry', () => {
    expect(credentialApprovalRefusal(pending, approval, NOW)).toBeNull();
  });

  it('reviews only a pending version', () => {
    expect(
      credentialApprovalRefusal({ ...pending, status: 'VERIFIED' }, approval, NOW),
    ).toBe('NOT_PENDING');
  });

  it('needs the expiry the reviewer read off the photo', () => {
    expect(
      credentialApprovalRefusal(pending, { ...approval, expiresOn: null }, NOW),
    ).toBe('EXPIRY_REQUIRED');
  });

  it('refuses an expired document and a future issue date', () => {
    expect(
      credentialApprovalRefusal(
        pending,
        { ...approval, expiresOn: day('2026-10-05') },
        NOW,
      ),
    ).toBe('ALREADY_EXPIRED');
    expect(
      credentialApprovalRefusal(
        pending,
        { ...approval, issuedOn: new Date(NOW.getTime() + DAY_MS) },
        NOW,
      ),
    ).toBe('ISSUED_IN_FUTURE');
    expect(
      credentialApprovalRefusal(
        pending,
        { ...approval, issuedOn: day('2026-10-06'), expiresOn: day('2026-10-06') },
        NOW,
      ),
    ).toBeNull();
  });
});

describe('credentialReviewSms', () => {
  it('fits one GSM-7 segment without accents or the desk’s reason', () => {
    for (const body of [credentialReviewSms(true), credentialReviewSms(false)]) {
      expect(body.length).toBeLessThanOrEqual(160);
      expect(body).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});
