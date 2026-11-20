'use client';

import type { DispatchCandidateDto } from '@ota/schemas';
import { Alert, Badge, Button, buttonClassName, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useDeskTelemetry } from '@/components/telemetry/desk-telemetry';
import { apiRequest } from '@/lib/client-api';
import type { DeskClock } from '@/lib/desk-clock';

/**
 * AL-Alerts' re-dispatch, inside the alert's card rather than a drawer: the
 * same qualified workers the desk's panel lists (verified, free on every day
 * of the service, licence valid beyond the window, not offered yet), each
 * with an Offer and a Call. The offer goes out as Ops Lite's
 * (`?channel=ops_lite`), and the card hears who got it.
 */
export function LiteRedispatch({
  serviceItemId,
  clock,
  onOffered,
  onCancel,
}: {
  serviceItemId: string;
  clock: DeskClock;
  onOffered: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('backoffice.opsLite.redispatch');
  const panel = useTranslations('backoffice.dashboard.panel');
  const track = useDeskTelemetry();
  const [candidates, setCandidates] = useState<DispatchCandidateDto[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<DispatchCandidateDto[]>(`/service-items/${serviceItemId}/candidates`)
      .then((list) => {
        if (!cancelled) setCandidates(list);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : panel('loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serviceItemId]);

  async function offer(candidate: DispatchCandidateDto, position: number) {
    setBusyId(candidate.supplierId);
    setError(null);
    try {
      await apiRequest(`/service-items/${serviceItemId}/reassign?channel=ops_lite`, {
        method: 'POST',
        body: JSON.stringify({ supplierId: candidate.supplierId }),
      });
      track('redispatch_triggered', {
        service_item_id: serviceItemId,
        mode: 'manual',
        candidates_shown: candidates?.length ?? 0,
        position_chosen: position,
        from: 'ops_lite',
      });
      onOffered(candidate.fullName ?? '—');
    } catch (offerError) {
      setError(offerError instanceof Error ? offerError.message : panel('offerFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-muted">
        {t('rule', { days: clock.credentialDays })}
      </p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {candidates === null && !error ? (
        <p className="text-body-sm text-muted">{panel('loading')}</p>
      ) : null}
      {candidates?.length === 0 ? (
        <p className="text-body-sm text-muted">{panel('empty')}</p>
      ) : null}
      {candidates && candidates.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {candidates.map((candidate, index) => {
            const name = candidate.fullName ?? '—';
            return (
              <li
                key={candidate.supplierId}
                className="flex items-center gap-2.5 rounded-md border bg-surface px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="truncate text-body-sm">{name}</strong>
                  <span className="text-caption text-muted">
                    {[
                      panel('meta', {
                        category: candidate.category.replaceAll('_', ' '),
                        provinces: candidate.provincesActive.join(', ') || '—',
                      }),
                      candidate.acceptanceRate === null
                        ? panel('noAnswers')
                        : panel('acceptance', {
                            rate: Math.round(candidate.acceptanceRate * 100),
                          }),
                    ].join(' · ')}
                  </span>
                  {candidate.belowReliabilityFloor ? (
                    <Badge variant="attention" className="self-start">
                      {panel('belowFloor', { floor: clock.floorPercent })}
                    </Badge>
                  ) : null}
                </div>
                <a
                  href={`tel:${candidate.primaryPhone}`}
                  aria-label={panel('callWorker', { name })}
                  className={buttonClassName({ variant: 'secondary', size: 'icon' })}
                >
                  <Icon name="phone" />
                </a>
                <Button
                  loading={busyId === candidate.supplierId}
                  disabled={busyId !== null}
                  aria-label={
                    busyId === candidate.supplierId ? undefined : t('offerTo', { name })
                  }
                  onClick={() => void offer(candidate, index + 1)}
                >
                  {busyId === candidate.supplierId ? panel('offering') : t('offer')}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Button variant="tertiary" className="self-start" onClick={onCancel}>
        {t('cancel')}
      </Button>
    </div>
  );
}
