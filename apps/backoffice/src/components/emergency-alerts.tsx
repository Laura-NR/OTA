'use client';

import { EMERGENCY_CATEGORIES, type EmergencyCategory } from '@ota/domain';
import type { IncidentDto } from '@ota/schemas';
import { Button, buttonClassName, cn, Icon } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

import { opsTime } from '@/lib/ops-format';

import { useDeskAlerts } from './desk-alerts';

/**
 * W-Job's on-site emergencies (`docs/schema-w-job.md` J6), first on the desk's
 * alert strip and on Ops Lite's alerts: who reported what and when, the
 * worker's phone, the position as text with a `geo:` link (no map service
 * sees it), the booking, and "I have it", which stops the alert for every
 * desk.
 */
export function EmergencyAlerts() {
  const t = useTranslations('backoffice.dashboard.emergency');
  const locale = useLocale();
  const alerts = useDeskAlerts();
  if (!alerts || alerts.emergencies.length === 0) {
    return null;
  }
  const action = cn(
    buttonClassName({ variant: 'secondary', size: 'sm' }),
    'border-transparent bg-neutral-0 text-error-700',
  );

  const category = (incident: IncidentDto) =>
    (EMERGENCY_CATEGORIES as readonly string[]).includes(incident.category)
      ? t(`categories.${incident.category as EmergencyCategory}`)
      : incident.category;

  return (
    <ul className="flex flex-col gap-2" aria-label={t('listLabel')}>
      {alerts.emergencies.map((incident) => {
        const worker = incident.supplierName ?? t('someone');
        return (
          <li
            key={incident.id}
            className="flex flex-col gap-2 rounded-md bg-error-600 px-4 py-3 text-body-sm text-neutral-0"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Icon name="alert-circle" />
              <p className="min-w-60 flex-1">
                <strong>{t('title', { code: incident.bookingCode })}</strong>.{' '}
                {t('body', {
                  worker,
                  time: opsTime(incident.occurredAt ?? incident.createdAt, locale),
                  category: category(incident),
                })}{' '}
                {incident.position
                  ? [
                      t('position', {
                        lat: incident.position.latitude.toFixed(5),
                        lng: incident.position.longitude.toFixed(5),
                      }),
                      incident.position.accuracyM === null
                        ? null
                        : t('accuracy', { accuracy: incident.position.accuracyM }),
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : t('noPosition')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {incident.supplierPhone ? (
                <a
                  href={`tel:${incident.supplierPhone.replace(/\s/g, '')}`}
                  className={action}
                >
                  <Icon name="phone" />
                  {t('call', { worker })}
                </a>
              ) : null}
              {incident.position ? (
                <a
                  href={`geo:${incident.position.latitude},${incident.position.longitude}`}
                  className={action}
                >
                  {t('openPosition')}
                </a>
              ) : null}
              <Link href={`/bookings/${incident.reservationId}`} className={action}>
                {t('openBooking')}
              </Link>
              {alerts.canManage ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className={action}
                  aria-label={t('acknowledgeFor', { code: incident.bookingCode })}
                  onClick={() => void alerts.acknowledgeEmergency(incident)}
                >
                  {t('acknowledge')}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
