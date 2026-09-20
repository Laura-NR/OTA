/**
 * Supplier verification and dispatch eligibility (spec §8.1).
 *
 * Regulatory invariant: no assignment may be auto-dispatched to a worker whose
 * verification_status is not VERIFIED. Workers within 30 days of credential
 * expiry are paused from auto-dispatch until re-verified.
 */
export const CREDENTIAL_EXPIRY_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const VerificationStatus = {
  PendingAudit: 'PENDING_AUDIT',
  Verified: 'VERIFIED',
  Rejected: 'REJECTED',
  Suspended: 'SUSPENDED',
} as const;

export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const SupplierCategory = {
  TourGuide: 'TOUR_GUIDE',
  PrivateDriver: 'PRIVATE_DRIVER',
  HomestayHost: 'HOMESTAY_HOST',
  Translator: 'TRANSLATOR',
} as const;

export type SupplierCategory = (typeof SupplierCategory)[keyof typeof SupplierCategory];

export function isCredentialExpiringSoon(
  expiresAt: Date,
  now: Date,
  windowDays: number = CREDENTIAL_EXPIRY_WINDOW_DAYS,
): boolean {
  return expiresAt.getTime() - now.getTime() <= windowDays * DAY_MS;
}

export interface DispatchEligibilityInput {
  verificationStatus: VerificationStatus;
  isAvailable: boolean;
  /** null when no credential expiry is tracked. */
  credentialExpiresAt: Date | null;
}

/**
 * True only when a worker may receive an automated dispatch.
 */
export function canAutoDispatch(input: DispatchEligibilityInput, now: Date): boolean {
  if (input.verificationStatus !== VerificationStatus.Verified) {
    return false;
  }
  if (!input.isAvailable) {
    return false;
  }
  if (input.credentialExpiresAt === null) {
    return true;
  }
  return !isCredentialExpiringSoon(input.credentialExpiresAt, now);
}
