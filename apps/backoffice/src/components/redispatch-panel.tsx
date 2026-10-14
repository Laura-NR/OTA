'use client';

import type { DispatchCandidateDto } from '@ota/schemas';
import { Alert, Badge, Button, buttonClassName, Drawer, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export interface RedispatchTarget {
  serviceItemId: string;
  /** "Guide · E2E0001 · 1–5 May 2027 · La Habana": what is being re-dispatched. */
  title: string;
  /** "2 h timer" or "30 min timer": the window a new offer gets. */
  timerLabel: string;
}

export interface RedispatchPanelProps {
  target: RedispatchTarget | null;
  onClose: () => void;
  /** Called once an offer went out, so the board can refresh. */
  onOffered: () => void;
}

/**
 * A-Dashboard's re-dispatch drawer: the qualified, available and verified
 * workers who were not offered this service yet (the API also leaves out
 * licences within 30 days of expiry), each with an offer and a call button.
 */
export function RedispatchPanel({ target, onClose, onOffered }: RedispatchPanelProps) {
  const t = useTranslations('backoffice.dashboard.panel');
  const [candidates, setCandidates] = useState<DispatchCandidateDto[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serviceItemId = target?.serviceItemId;

  useEffect(() => {
    if (!serviceItemId) {
      return;
    }
    let cancelled = false;
    setCandidates(null);
    setError(null);
    apiRequest<DispatchCandidateDto[]>(`/service-items/${serviceItemId}/candidates`)
      .then((list) => {
        if (!cancelled) setCandidates(list);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : t('loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serviceItemId, t]);

  async function offer(supplierId: string) {
    if (!serviceItemId) return;
    setBusyId(supplierId);
    setError(null);
    try {
      await apiRequest(`/service-items/${serviceItemId}/reassign`, {
        method: 'POST',
        body: JSON.stringify({ supplierId }),
      });
      onOffered();
      onClose();
    } catch (offerError) {
      setError(offerError instanceof Error ? offerError.message : t('offerFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Drawer
      open={target !== null}
      onClose={onClose}
      title={target ? t('title', { what: target.title }) : ''}
      closeLabel={t('close')}
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-secondary">{t('rule')}</p>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {candidates === null && !error ? (
          <p className="text-body-sm text-muted">{t('loading')}</p>
        ) : null}
        {candidates?.length === 0 ? (
          <p className="text-body-sm text-muted">{t('empty')}</p>
        ) : null}
        {candidates && candidates.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <li
                key={candidate.supplierId}
                className="flex flex-col gap-2 rounded-md border bg-surface p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{candidate.fullName ?? '—'}</span>
                  <Badge variant="success">{t('verified')}</Badge>
                </div>
                <p className="text-caption text-secondary">
                  {t('meta', {
                    category: candidate.category.replaceAll('_', ' '),
                    provinces: candidate.provincesActive.join(', ') || '—',
                  })}
                </p>
                {candidate.credentialExpiresAt ? (
                  <p className="text-caption text-muted">
                    {t('licence', {
                      date: new Date(candidate.credentialExpiresAt).toLocaleDateString(),
                    })}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    loading={busyId === candidate.supplierId}
                    disabled={busyId !== null}
                    onClick={() => void offer(candidate.supplierId)}
                  >
                    {busyId === candidate.supplierId
                      ? t('offering')
                      : t('offer', { timer: target?.timerLabel ?? '' })}
                  </Button>
                  <a
                    href={`tel:${candidate.primaryPhone}`}
                    className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                  >
                    <Icon name="phone" />
                    {t('call')}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Drawer>
  );
}
