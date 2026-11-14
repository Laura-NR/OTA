import {
  CREDENTIAL_EXPIRY_WINDOW_DAYS,
  SupplierCategory,
  VerificationStatus,
  isCredentialExpiringSoon,
} from './compliance';

/**
 * W-Credentials (`docs/schema-w-credentials.md`). A supplier holds one row
 * per uploaded version of each document; these rules derive what each
 * document shows (its current and pending version), the earliest expiry
 * dispatch reads (V3), the approval gate, and the worker's summary.
 */

export const CREDENTIAL_KINDS = [
  'TRANSPORT_LICENCE',
  'TECHNICAL_INSPECTION',
  'LIABILITY_INSURANCE',
  'GUIDE_LICENCE',
  'HOST_LICENCE',
  'IDENTITY_CARD',
] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_STATUSES = [
  'PENDING_AUDIT',
  'VERIFIED',
  'REJECTED',
  'SUPERSEDED',
] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

/**
 * The documents each category needs (V2a), in the order the app and the desk
 * list them. Placeholders until the agency and counsel confirm them.
 */
export const REQUIRED_CREDENTIALS: Record<SupplierCategory, readonly CredentialKind[]> = {
  [SupplierCategory.PrivateDriver]: [
    'TRANSPORT_LICENCE',
    'TECHNICAL_INSPECTION',
    'LIABILITY_INSURANCE',
    'IDENTITY_CARD',
  ],
  [SupplierCategory.TourGuide]: ['GUIDE_LICENCE', 'IDENTITY_CARD'],
  [SupplierCategory.HomestayHost]: ['HOST_LICENCE', 'IDENTITY_CARD'],
  [SupplierCategory.Translator]: ['IDENTITY_CARD'],
};

/**
 * The identity card is checked in person and no photo of it is kept (V5a);
 * it has no file and no expiry. Every other kind is a photo with an expiry.
 */
export function credentialHasFile(kind: CredentialKind): boolean {
  return kind !== 'IDENTITY_CARD';
}

/** Why a document may not be uploaded for a supplier. */
export type CredentialUploadRefusal = 'NOT_REQUIRED' | 'NO_FILE_KIND';

export function credentialUploadRefusal(
  category: SupplierCategory,
  kind: CredentialKind,
): CredentialUploadRefusal | null {
  if (!REQUIRED_CREDENTIALS[category].includes(kind)) return 'NOT_REQUIRED';
  if (!credentialHasFile(kind)) return 'NO_FILE_KIND';
  return null;
}

/** The fields a version carries that these rules read. */
export interface CredentialVersion {
  kind: CredentialKind;
  status: CredentialStatus;
  /** The last valid day, at UTC midnight; null for a kind with no expiry. */
  expiresOn: Date | null;
  uploadedAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function latest<T extends CredentialVersion>(versions: readonly T[]): T | null {
  return versions.reduce<T | null>(
    (best, version) =>
      !best || version.uploadedAt.getTime() > best.uploadedAt.getTime() ? version : best,
    null,
  );
}

/** A document of one kind as it stands: what counts now, and what is on its way. */
export interface CredentialSlot<T extends CredentialVersion> {
  kind: CredentialKind;
  /** The verified version; at most one is kept VERIFIED per kind. */
  current: T | null;
  /** The upload waiting for the desk. */
  pending: T | null;
  /** The latest rejection, only when nothing newer was uploaded since. */
  rejected: T | null;
}

/** One slot per required kind, in the category's order. */
export function credentialSlots<T extends CredentialVersion>(
  category: SupplierCategory,
  versions: readonly T[],
): CredentialSlot<T>[] {
  return REQUIRED_CREDENTIALS[category].map((kind) => {
    const ofKind = versions.filter((version) => version.kind === kind);
    const current = latest(ofKind.filter((version) => version.status === 'VERIFIED'));
    const pending = latest(
      ofKind.filter((version) => version.status === 'PENDING_AUDIT'),
    );
    const lastRejected = latest(
      ofKind.filter((version) => version.status === 'REJECTED'),
    );
    const newest = latest(
      [current, pending].filter((version): version is T => !!version),
    );
    const rejected =
      lastRejected &&
      (!newest || lastRejected.uploadedAt.getTime() > newest.uploadedAt.getTime())
        ? lastRejected
        : null;
    return { kind, current, pending, rejected };
  });
}

/**
 * The date dispatch reads (`supplier_profiles.credential_expires_at`, V3a):
 * the earliest expiry among the verified versions, null when none expires.
 */
export function currentCredentialExpiry(
  versions: readonly CredentialVersion[],
): Date | null {
  return versions.reduce<Date | null>((earliest, version) => {
    if (version.status !== 'VERIFIED' || !version.expiresOn) return earliest;
    return !earliest || version.expiresOn.getTime() < earliest.getTime()
      ? version.expiresOn
      : earliest;
  }, null);
}

/** The required kinds with no verified version: the desk may not approve the supplier (V3a). */
export function missingCredentials(
  category: SupplierCategory,
  versions: readonly CredentialVersion[],
): CredentialKind[] {
  return REQUIRED_CREDENTIALS[category].filter(
    (kind) =>
      !versions.some((version) => version.kind === kind && version.status === 'VERIFIED'),
  );
}

export type CredentialState = 'MISSING' | 'VALID' | 'EXPIRING' | 'EXPIRED';

/** A document is valid through its expiry day; the pause starts `windowDays` before. */
export function credentialState(
  current: Pick<CredentialVersion, 'expiresOn'> | null,
  now: Date,
  windowDays: number = CREDENTIAL_EXPIRY_WINDOW_DAYS,
): CredentialState {
  if (!current) return 'MISSING';
  if (!current.expiresOn) return 'VALID';
  if (current.expiresOn.getTime() + DAY_MS <= now.getTime()) return 'EXPIRED';
  return isCredentialExpiringSoon(current.expiresOn, now, windowDays)
    ? 'EXPIRING'
    : 'VALID';
}

/** The day auto-dispatch pauses for a document: "Desde el 31 oct (30 días antes)". */
export function credentialPauseFrom(
  expiresOn: Date,
  windowDays: number = CREDENTIAL_EXPIRY_WINDOW_DAYS,
): Date {
  return new Date(expiresOn.getTime() - windowDays * DAY_MS);
}

/** The worker's summary, the board's "Cómo funciona": Activa, En revisión, Vence pronto, Suspendida. */
export type CredentialSummaryState = 'ACTIVE' | 'IN_REVIEW' | 'EXPIRING' | 'SUSPENDED';

export interface CredentialSummary {
  state: CredentialSummaryState;
  /** Whether the documents let dispatch offer jobs automatically (availability aside). */
  autoOffers: boolean;
  /** The earliest expiry among current documents, for "Siguiente vencimiento". */
  nextExpiry: { kind: CredentialKind; expiresOn: Date } | null;
}

/**
 * Suspended when the desk suspended or rejected the supplier or a document
 * expired; expiring when one is inside the pause window; in review while the
 * supplier awaits its first audit, or while the upload that would lift a
 * pause waits for the desk. A renewal under review beside a valid document
 * leaves the worker active ("Sigues activo porque la licencia actual no ha
 * vencido").
 */
export function credentialSummary<T extends CredentialVersion>(
  verificationStatus: VerificationStatus,
  slots: readonly CredentialSlot<T>[],
  now: Date,
  windowDays: number = CREDENTIAL_EXPIRY_WINDOW_DAYS,
): CredentialSummary {
  const nextExpiry = slots.reduce<CredentialSummary['nextExpiry']>((earliest, slot) => {
    const expiresOn = slot.current?.expiresOn;
    if (!expiresOn) return earliest;
    return !earliest || expiresOn.getTime() < earliest.expiresOn.getTime()
      ? { kind: slot.kind, expiresOn }
      : earliest;
  }, null);
  const states = slots.map((slot) => credentialState(slot.current, now, windowDays));
  const blockedAwaitingReview = slots.some(
    (slot, index) =>
      (states[index] === 'EXPIRED' || states[index] === 'EXPIRING') && slot.pending,
  );

  let state: CredentialSummaryState;
  if (
    verificationStatus === VerificationStatus.Suspended ||
    verificationStatus === VerificationStatus.Rejected
  ) {
    state = 'SUSPENDED';
  } else if (
    verificationStatus === VerificationStatus.PendingAudit ||
    blockedAwaitingReview
  ) {
    state = 'IN_REVIEW';
  } else if (states.includes('EXPIRED')) {
    state = 'SUSPENDED';
  } else if (states.includes('EXPIRING')) {
    state = 'EXPIRING';
  } else {
    state = 'ACTIVE';
  }

  return {
    state,
    autoOffers:
      verificationStatus === VerificationStatus.Verified &&
      !states.includes('EXPIRED') &&
      !states.includes('EXPIRING'),
    nextExpiry,
  };
}

/** What the reviewer types off the photo when approving (V4a). */
export interface CredentialApproval {
  number: string | null;
  issuer: string | null;
  issuedOn: Date | null;
  expiresOn: Date | null;
}

export type CredentialApprovalRefusal =
  'NOT_PENDING' | 'EXPIRY_REQUIRED' | 'ALREADY_EXPIRED' | 'ISSUED_IN_FUTURE';

/**
 * Only a pending version is reviewed; a kind that expires needs an expiry from
 * today on, and the issue date cannot be in the future (so, with whole days, it
 * never falls after the expiry).
 */
export function credentialApprovalRefusal(
  version: Pick<CredentialVersion, 'kind' | 'status'>,
  approval: CredentialApproval,
  now: Date,
): CredentialApprovalRefusal | null {
  if (version.status !== 'PENDING_AUDIT') return 'NOT_PENDING';
  if (credentialHasFile(version.kind) && !approval.expiresOn) return 'EXPIRY_REQUIRED';
  if (approval.expiresOn && approval.expiresOn.getTime() + DAY_MS <= now.getTime()) {
    return 'ALREADY_EXPIRED';
  }
  if (approval.issuedOn && approval.issuedOn.getTime() > now.getTime()) {
    return 'ISSUED_IN_FUTURE';
  }
  return null;
}

/**
 * The review's SMS to the worker (ADR 0007: one GSM-7 segment, no accents).
 * The reason is the desk's own words, so it is left out; the app shows it.
 */
export function credentialReviewSms(approved: boolean): string {
  return approved
    ? 'Vereda: la central verifico tu documento nuevo. Lo ves en la app, en Mis credenciales.'
    : 'Vereda: la central no pudo aceptar tu documento. Abre Mis credenciales en la app para ver el motivo y subirlo de nuevo.';
}
