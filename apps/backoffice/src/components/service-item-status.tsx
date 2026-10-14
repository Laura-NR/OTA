import {
  serviceItemAlert,
  timerElapsed,
  type EscalationAlert,
  type ServiceItemStatus as ItemStatus,
} from '@ota/domain';
import { Badge, cn, type BadgeVariant } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';

import { hoursMinutes, opsTime } from '@/lib/ops-format';

/** The timer bar's fill for each alert: on time, amber, red. */
export const TIMER_FILL: Record<EscalationAlert, string> = {
  NONE: 'bg-primary-600',
  AMBER: 'bg-warning-600',
  RED: 'bg-error-600',
};

/** Items a desk operator may still re-route: not yet held by a worker. */
export const OPEN_ITEM_STATUSES: readonly string[] = [
  'UNASSIGNED',
  'OFFERED',
  'DECLINED',
  'TIMEOUT',
];

export interface ItemClock {
  status: ItemStatus;
  offeredAt: string | null;
  deadline: string | null;
}

/** A service item's alert at `now`. */
export function itemAlert(item: ItemClock, now: Date): EscalationAlert {
  return serviceItemAlert({
    status: item.status,
    offeredAt: item.offeredAt ? new Date(item.offeredAt) : null,
    deadline: item.deadline ? new Date(item.deadline) : null,
    now,
  });
}

/**
 * One service item's state on the desk (A-Dashboard, A-Booking): the DS 03
 * pill ("Offered · 1 h 31 m · 76 %") and, while an offer runs or once it timed
 * out, the timer bar in its alert colour. The parent owns the ticking clock.
 */
export function ServiceItemStatusBadge({ item, now }: { item: ItemClock; now: Date }) {
  const t = useTranslations('backoffice.dashboard');
  const locale = useLocale();
  const alert = itemAlert(item, now);
  const offeredAt = item.offeredAt ? new Date(item.offeredAt) : null;
  const deadline = item.deadline ? new Date(item.deadline) : null;
  const elapsed = offeredAt && deadline ? timerElapsed(offeredAt, deadline, now) : null;
  const share = elapsed === null ? 0 : Math.round(elapsed * 100);

  let label: string;
  let variant: BadgeVariant;
  switch (item.status) {
    case 'OFFERED': {
      const { hours, minutes } = hoursMinutes(
        offeredAt ? now.getTime() - offeredAt.getTime() : 0,
      );
      const waited =
        hours > 0 ? t('hoursMinutes', { hours, minutes }) : t('minutes', { minutes });
      label =
        alert === 'NONE'
          ? t('status.offered', { elapsed: waited })
          : t('status.offeredLate', { elapsed: waited, percent: share });
      variant =
        alert === 'RED' ? 'destructive' : alert === 'AMBER' ? 'attention' : 'info';
      break;
    }
    case 'ACCEPTED':
    case 'FULFILLED':
      label = t(`status.${item.status === 'ACCEPTED' ? 'accepted' : 'fulfilled'}`);
      variant = 'success';
      break;
    case 'DECLINED':
      label = t('status.declined');
      variant = 'destructive';
      break;
    case 'TIMEOUT':
      label = deadline
        ? t('status.timeoutAt', { time: opsTime(deadline, locale) })
        : t('status.timeout');
      variant = 'timeout';
      break;
    default:
      label = t('status.unassigned');
      variant = 'secondary';
  }

  return (
    <>
      <Badge
        variant={variant}
        className={cn('self-start', item.status === 'DECLINED' && 'border-error-600')}
      >
        {label}
      </Badge>
      {elapsed !== null && (item.status === 'OFFERED' || item.status === 'TIMEOUT') ? (
        <span
          role="img"
          aria-label={t('elapsed', { percent: share })}
          className="block h-1.5 overflow-hidden rounded-full bg-neutral-200"
        >
          <span
            className={cn('block h-full', TIMER_FILL[alert])}
            style={{ width: `${share}%` }}
          />
        </span>
      ) : null}
    </>
  );
}
