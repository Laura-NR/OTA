import type { ReservationStatus } from '@ota/domain';
import { Badge } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';

const VARIANTS: Record<ReservationStatus, BadgeVariant> = {
  DRAFT: 'outline',
  ITINERARY_SUBMITTED: 'secondary',
  DISPATCH_IN_PROGRESS: 'secondary',
  ASSEMBLY_AND_ESCALATION: 'destructive',
  SECURED_AND_INVOICED: 'secondary',
  PENDING_PAYMENT: 'default',
  ACTION_REQUIRED: 'destructive',
  CONFIRMED: 'success',
  IN_PROGRESS: 'default',
  COMPLETED: 'success',
  CANCELLED: 'outline',
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge variant={VARIANTS[status]}>{status.replaceAll('_', ' ')}</Badge>;
}
