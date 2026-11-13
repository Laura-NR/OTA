import type { AdvisoryDisplayStatus, AdvisorySeverity } from '@ota/domain';
import type { BadgeVariant, CrisisSeverity } from '@ota/ui';

/** M7 advisories on the desk: the DS 03 banner tone and the badge for each value. */
export const BANNER_SEVERITY: Record<AdvisorySeverity, CrisisSeverity> = {
  INFO: 'info',
  CAUTION: 'warning',
  CRITICAL: 'critical',
};

export const SEVERITY_BADGE: Record<AdvisorySeverity, BadgeVariant> = {
  INFO: 'info',
  CAUTION: 'warning',
  CRITICAL: 'destructive',
};

export const STATUS_BADGE: Record<AdvisoryDisplayStatus, BadgeVariant> = {
  DRAFT: 'outline',
  IN_REVIEW: 'warning',
  PUBLISHED: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'secondary',
  SUPERSEDED: 'secondary',
  LIFTED: 'secondary',
};

export interface RegionGroup {
  key: 'west' | 'centre' | 'east' | 'isle';
  codes: string[];
}
