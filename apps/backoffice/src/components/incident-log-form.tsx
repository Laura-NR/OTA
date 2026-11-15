'use client';

import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/**
 * Log an incident against a booking (spec §4.9.4 duty of care). A worker's
 * emergency that reached the desk only by SMS is entered here as such, on the
 * service it concerns (W-Job J6); the API files it as already in hand.
 */
export function IncidentLogForm({
  reservationId,
  services,
}: {
  reservationId: string;
  /** The booking's services, for "Service". */
  services: ReadonlyArray<{ id: string; label: string }>;
}) {
  const t = useTranslations('backoffice.incidents');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError(null);

    try {
      await apiRequest(`/reservations/${reservationId}/incidents`, {
        method: 'POST',
        body: JSON.stringify({
          category: form.get('category'),
          description: form.get('description'),
          severity: form.get('severity') || 'MEDIUM',
          source: form.get('source') || 'DESK',
          ...(form.get('serviceItemId')
            ? { serviceItemId: form.get('serviceItemId') }
            : {}),
        }),
      });
      element.reset();
      router.refresh();
    } catch (logError) {
      setError(logError instanceof Error ? logError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="incident-category">{t('category')}</Label>
          <Input
            id="incident-category"
            name="category"
            required
            maxLength={100}
            placeholder={t('categoryPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="incident-severity">{t('severity')}</Label>
          <Select id="incident-severity" name="severity" defaultValue="MEDIUM">
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="incident-source">{t('source')}</Label>
          <Select id="incident-source" name="source" defaultValue="DESK">
            <option value="DESK">{t('sources.DESK')}</option>
            <option value="WORKER_SMS">{t('sources.WORKER_SMS')}</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="incident-service">{t('service')}</Label>
          <Select id="incident-service" name="serviceItemId" defaultValue="">
            <option value="">{t('serviceNone')}</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="incident-description">{t('description')}</Label>
        <Input id="incident-description" name="description" required maxLength={2000} />
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button type="submit" disabled={busy}>
        {busy ? t('logging') : t('log')}
      </Button>
    </form>
  );
}
