import type { DisruptionSeverity, TravelerSafety } from '@ota/domain';
import type { BadgeVariant } from '@ota/ui';

/** M8 disruptions on the desk: the badge for each severity and safety state. */
export const DISRUPTION_SEVERITY_BADGE: Record<DisruptionSeverity, BadgeVariant> = {
  MINOR: 'info',
  MAJOR: 'warning',
  EMERGENCY: 'destructive',
};

/** An overdue "Unknown" takes the solid `timeout` red instead (D6). */
export const SAFETY_BADGE: Record<TravelerSafety, BadgeVariant> = {
  UNKNOWN: 'outline',
  SAFE: 'success',
  NEEDS_HELP: 'destructive',
};
