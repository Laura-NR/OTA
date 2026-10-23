'use client';

import {
  resolveDispatchTimeoutMs,
  type ReservationStatus,
  type ServiceType,
} from '@ota/domain';
import type { ReservationDeskItemDto } from '@ota/schemas';
import {
  Button,
  buttonClassName,
  EmptyState,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { DeskClock } from '@/lib/desk-clock';
import { bookingDates, hoursMinutes, money } from '@/lib/ops-format';

import { StartDispatchButton } from './dispatch-controls';
import { RedispatchPanel, type RedispatchTarget } from './redispatch-panel';
import {
  itemAlert,
  OPEN_ITEM_STATUSES,
  ServiceItemStatusBadge,
} from './service-item-status';

const SERVICE_KEYS: Record<ServiceType, string> = {
  ACCOMMODATION: 'stay',
  TRANSPORTATION: 'transport',
  GUIDE: 'guide',
  EXPERIENCE: 'activities',
};

/** A running offer's clock and phone, from the booking's dispatch view. */
export interface ItemOffer {
  offeredAt: string | null;
  deadline: string | null;
  workerPhone: string | null;
}

export interface BookingServicesProps {
  reservationId: string;
  bookingCode: string;
  status: ReservationStatus;
  startDate: string;
  endDate: string;
  currency: string;
  items: ReservationDeskItemDto[];
  offers: Record<string, ItemOffer>;
  serverNow: number;
  /** The M9 timers and amber share in force. */
  clock: DeskClock;
  canManage: boolean;
}

/**
 * A-Booking's service items: each service with its worker, its state and timer,
 * the payout agreed and what the desk can do (call, re-dispatch). A submitted
 * booking starts its dispatch here, as on the dashboard.
 */
export function BookingServices({
  reservationId,
  bookingCode,
  status,
  startDate,
  endDate,
  currency,
  items,
  offers,
  serverNow,
  clock,
  canManage,
}: BookingServicesProps) {
  const t = useTranslations('backoffice.reservation.services');
  const dashboard = useTranslations('backoffice.dashboard');
  const locale = useLocale();
  const router = useRouter();
  const [nowMs, setNowMs] = useState(serverNow);
  const [target, setTarget] = useState<RedispatchTarget | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const now = new Date(nowMs);
  const dispatching = status !== 'DRAFT' && status !== 'ITINERARY_SUBMITTED';
  const { hours, minutes } = hoursMinutes(
    resolveDispatchTimeoutMs({
      now,
      arrivalAt: new Date(startDate),
      timers: clock.timers,
    }),
  );
  const timerLabel =
    hours > 0
      ? dashboard('timerHours', { hours })
      : dashboard('timerMinutes', { minutes });

  if (items.length === 0) {
    return <EmptyState title={t('empty')} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {status === 'ITINERARY_SUBMITTED' ? (
        <div className="flex flex-wrap items-center gap-3 px-5">
          <StartDispatchButton reservationId={reservationId} canManage={canManage} />
          <p className="text-caption text-muted">{t('startHint')}</p>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('service')}</TableHead>
            <TableHead scope="col">{t('worker')}</TableHead>
            <TableHead scope="col">{t('status')}</TableHead>
            <TableHead scope="col" className="text-right">
              {t('payout')}
            </TableHead>
            <TableHead scope="col">
              <span className="sr-only">{t('act')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const offer = offers[item.id];
            const itemClock = {
              status: item.status,
              offeredAt: offer?.offeredAt ?? null,
              deadline: offer?.deadline ?? null,
            };
            const alert = itemAlert(itemClock, now, clock.amberThreshold);
            const service = dashboard(`matrix.columns.${SERVICE_KEYS[item.serviceType]}`);
            const reroute =
              canManage &&
              dispatching &&
              OPEN_ITEM_STATUSES.includes(item.status) &&
              (alert !== 'NONE' || item.status === 'UNASSIGNED');
            return (
              <TableRow
                key={item.id}
                tone={
                  alert === 'RED'
                    ? 'destructive'
                    : alert === 'AMBER'
                      ? 'attention'
                      : undefined
                }
              >
                <TableCell className="align-top">
                  <div className="flex min-w-32 flex-col">
                    <span className="font-medium">{service}</span>
                    <span className="text-caption text-muted">
                      {[
                        item.province,
                        bookingDates(item.serviceDateStart, item.serviceDateEnd, locale),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  {item.supplierName ?? (
                    <span className="text-muted">{dashboard('noWorker')}</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex min-w-36 flex-col gap-1.5">
                    <ServiceItemStatusBadge
                      item={itemClock}
                      now={now}
                      amberThreshold={clock.amberThreshold}
                    />
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right align-top font-mono">
                  {money(Number(item.payoutRate), currency, locale)}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap justify-end gap-2">
                    {offer?.workerPhone && item.status === 'OFFERED' ? (
                      <a
                        href={`tel:${offer.workerPhone}`}
                        className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                      >
                        <Icon name="phone" />
                        {t('call')}
                      </a>
                    ) : null}
                    {reroute ? (
                      <Button
                        size="sm"
                        variant={alert === 'RED' ? 'destructive' : 'secondary'}
                        onClick={() =>
                          setTarget({
                            serviceItemId: item.id,
                            title: [
                              service,
                              bookingCode,
                              bookingDates(startDate, endDate, locale),
                              item.province,
                            ]
                              .filter(Boolean)
                              .join(' · '),
                            timerLabel,
                          })
                        }
                      >
                        {dashboard('redispatch')}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="px-5 text-caption text-muted">{t('rule')}</p>
      <RedispatchPanel
        clock={clock}
        target={target}
        onClose={() => setTarget(null)}
        onOffered={() => router.refresh()}
      />
    </div>
  );
}
