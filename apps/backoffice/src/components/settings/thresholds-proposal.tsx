'use client';

import {
  ADVISORY_DUAL_APPROVAL_LEVELS,
  changedThresholds,
  type OperatingThresholds,
} from '@ota/domain';
import type { SettingsVersionDto } from '@ota/schemas';
import { Alert, Button, Field, Input, Select, Textarea } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import {
  THRESHOLD_FIELDS,
  THRESHOLD_GROUPS,
  thresholdText,
} from '@/lib/threshold-fields';

export interface ThresholdsProposalProps {
  current: OperatingThresholds;
  defaults: OperatingThresholds;
  pending: SettingsVersionDto | null;
  actorId: string;
}

/**
 * A-Settings' "Approvals & thresholds" changes (M9 D1–D3), for Super Admins.
 * With a proposal waiting, it shows what changes and lets the other Super
 * Admins apply or reject it and its author withdraw it; otherwise it is the
 * proposal form, with "Reset to spec defaults". The page keys it by the
 * version in force and the pending proposal, so a refresh resets it.
 */
export function ThresholdsProposal({
  current,
  defaults,
  pending,
  actorId,
}: ThresholdsProposalProps) {
  const t = useTranslations('backoffice.settings.thresholds');
  const units = useTranslations('backoffice.settings.thresholds.units');
  const levels = useTranslations('advisoriesDesk.severities');
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [values, setValues] = useState<OperatingThresholds>(current);
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = (key: keyof OperatingThresholds, value: number | string) =>
    thresholdText(
      THRESHOLD_FIELDS.find((field) => field.key === key)!,
      value,
      locale,
      units,
      levels,
    );

  async function act(path: string, body?: unknown) {
    setPendingAction(true);
    setError(null);
    try {
      await apiRequest(path, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  if (pending) {
    const mine = pending.proposedById === actorId;
    return (
      <section
        aria-labelledby={`${id}-pending`}
        className="flex flex-col gap-3 rounded-lg border border-warning-500 bg-warning-100 px-5 py-4"
      >
        <h3 id={`${id}-pending`} className="text-h4">
          {t('pendingTitle', { version: pending.version })}
        </h3>
        <p className="text-body-sm">
          {t('pendingBy', {
            name: pending.proposedByName ?? '—',
            reason: pending.reason,
          })}
        </p>
        <ul className="flex flex-col gap-1 text-body-sm">
          {pending.changes.map((key) => {
            const field = key as keyof OperatingThresholds;
            return (
              <li key={key}>
                <span className="font-medium">{t(`labels.${field}`)}</span>
                {': '}
                {text(field, current[field])} →{' '}
                <strong>{text(field, pending.values[field])}</strong>
              </li>
            );
          })}
        </ul>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          {mine ? (
            <Button
              variant="secondary"
              disabled={pendingAction}
              onClick={() =>
                void act(`/settings/operating/versions/${pending.id}/withdraw`)
              }
            >
              {t('withdraw')}
            </Button>
          ) : (
            <>
              <Button
                disabled={pendingAction}
                onClick={() =>
                  void act(`/settings/operating/versions/${pending.id}/apply`)
                }
              >
                {t('apply')}
              </Button>
              <Button
                variant="secondary"
                disabled={pendingAction}
                onClick={() =>
                  void act(`/settings/operating/versions/${pending.id}/reject`)
                }
              >
                {t('reject')}
              </Button>
            </>
          )}
        </div>
        <p className="text-caption text-secondary">
          {mine ? t('pendingMine') : t('pendingOther')}
        </p>
      </section>
    );
  }

  const changes = changedThresholds(current, values);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void act('/settings/operating/versions', { values, reason });
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      {THRESHOLD_GROUPS.map((group) => (
        <fieldset key={group.key} className="flex flex-col gap-3">
          <legend className="pb-2 text-body font-semibold">
            {t(`groups.${group.key}`)}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {group.fields.map((field) => (
              <Field
                key={field.key}
                id={`${id}-${field.key}`}
                label={t(`labels.${field.key}`)}
                hint={
                  field.unit === 'level'
                    ? undefined
                    : t('bounds', { min: field.min ?? 0, max: field.max ?? 0 })
                }
              >
                {(control) =>
                  field.unit === 'level' ? (
                    <Select
                      {...control}
                      value={String(values[field.key])}
                      onChange={(event) =>
                        setValues({ ...values, [field.key]: event.target.value })
                      }
                    >
                      {ADVISORY_DUAL_APPROVAL_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {t(`levels.${level}`)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      {...control}
                      type="number"
                      inputMode="numeric"
                      min={field.min}
                      max={field.max}
                      step="1"
                      className="font-mono"
                      value={String(values[field.key])}
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.key]:
                            event.target.value === '' ? 0 : Number(event.target.value),
                        })
                      }
                    />
                  )
                }
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
      <Field id={`${id}-reason`} label={t('reason')} hint={t('reasonHint')} required>
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </Field>
      <p className="text-caption text-secondary" aria-live="polite">
        {changes.length === 0
          ? t('noChanges')
          : t('changes', { list: changes.map((key) => t(`labels.${key}`)).join(', ') })}
      </p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pendingAction || changes.length === 0 || reason.trim().length < 3}
        >
          {t('propose')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setValues(defaults)}>
          {t('reset')}
        </Button>
      </div>
      <p className="text-caption text-muted">{t('proposeNote')}</p>
    </form>
  );
}
