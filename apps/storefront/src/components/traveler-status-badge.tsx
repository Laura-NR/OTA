import { travelerStatus } from '@ota/domain';
import type { ReservationStatus, TravelerStatus } from '@ota/domain';
import { Badge } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { useTranslations } from 'next-intl';

/** The DS 03 pill tone of each traveler label. */
const TONES: Record<TravelerStatus, BadgeVariant> = {
  draft: 'outline',
  requestReceived: 'info',
  confirmingWithHosts: 'warning',
  actionNeeded: 'attention',
  readyToPay: 'accent',
  confirmed: 'success',
  onTrip: 'info',
  completed: 'secondary',
  cancelled: 'destructive',
};

/** A booking's status as the traveler is told it: the DS 03 label, never the system state. */
export function TravelerStatusBadge({ status }: { status: ReservationStatus }) {
  const t = useTranslations('status.traveler');
  const label = travelerStatus(status);
  return <Badge variant={TONES[label]}>{t(label)}</Badge>;
}
