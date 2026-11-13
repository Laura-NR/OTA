/**
 * M1 package publish checks (spec §3.3, A-Package-Edit). Moving a package to
 * PUBLISHED is gated: it needs a name, slug, at least one service and one
 * departure, alt text on every photo, consent for photos that show people,
 * known policy keys, and REQUEST booking — INSTANT stays locked until every
 * component is allotment-backed. Pure, so the rules are unit-tested.
 */

export const PackageStatus = {
  Draft: 'DRAFT',
  InReview: 'IN_REVIEW',
  Published: 'PUBLISHED',
  Archived: 'ARCHIVED',
} as const;

export type PackageStatus = (typeof PackageStatus)[keyof typeof PackageStatus];

export type BookingModel = 'REQUEST' | 'INSTANT';

export type PublishIssue =
  | 'NAME_REQUIRED'
  | 'SLUG_REQUIRED'
  | 'SERVICE_REQUIRED'
  | 'DEPARTURE_REQUIRED'
  | 'MEDIA_ALT_REQUIRED'
  | 'MEDIA_CONSENT_REQUIRED'
  | 'UNKNOWN_POLICY'
  | 'INSTANT_UNAVAILABLE';

export interface PublishMedia {
  altText: string;
  showsPeople: boolean;
  consentReference: string | null;
}

export interface PackagePublishInput {
  name: string;
  slug: string;
  serviceCount: number;
  departureCount: number;
  bookingModel: BookingModel;
  cancellationPolicy: string | null;
  depositPolicy: string | null;
  media: readonly PublishMedia[];
  /** Policy keys the tenant manifest defines. */
  knownPolicyKeys: readonly string[];
  /** True once every component is allotment-backed; false today. */
  instantAvailable?: boolean;
}

/** The reasons a package may not be published; empty means it can. */
export function packagePublishIssues(input: PackagePublishInput): PublishIssue[] {
  const issues: PublishIssue[] = [];

  if (input.name.trim().length === 0) issues.push('NAME_REQUIRED');
  if (input.slug.trim().length === 0) issues.push('SLUG_REQUIRED');
  if (input.serviceCount < 1) issues.push('SERVICE_REQUIRED');
  if (input.departureCount < 1) issues.push('DEPARTURE_REQUIRED');

  if (input.media.some((media) => media.altText.trim().length === 0)) {
    issues.push('MEDIA_ALT_REQUIRED');
  }
  if (
    input.media.some(
      (media) => media.showsPeople && (media.consentReference ?? '').trim().length === 0,
    )
  ) {
    issues.push('MEDIA_CONSENT_REQUIRED');
  }

  const policies = [input.cancellationPolicy, input.depositPolicy].filter(
    (key): key is string => key !== null,
  );
  if (policies.some((key) => !input.knownPolicyKeys.includes(key))) {
    issues.push('UNKNOWN_POLICY');
  }

  if (input.bookingModel === 'INSTANT' && !(input.instantAvailable ?? false)) {
    issues.push('INSTANT_UNAVAILABLE');
  }

  return issues;
}

export function canPublishPackage(input: PackagePublishInput): boolean {
  return packagePublishIssues(input).length === 0;
}
