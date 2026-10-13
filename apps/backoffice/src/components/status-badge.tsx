import type { ReservationStatus } from '@ota/domain';
import { Badge } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';

/** The DS 03 tone of each system state; the label stays the system state. */
const VARIANTS: Record<ReservationStatus, BadgeVariant> = {
  DRAFT: 'outline',
  ITINERARY_SUBMITTED: 'info',
  DISPATCH_IN_PROGRESS: 'warning',
  ASSEMBLY_AND_ESCALATION: 'warning',
  SECURED_AND_INVOICED: 'accent',
  PENDING_PAYMENT: 'accent',
  ACTION_REQUIRED: 'attention',
  CONFIRMED: 'success',
  IN_PROGRESS: 'info',
  COMPLETED: 'secondary',
  CANCELLED: 'destructive',
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge variant={VARIANTS[status]}>{status.replaceAll('_', ' ')}</Badge>;
}
