'use client';

import { DISRUPTION_SEVERITIES, TRAVELER_SAFETY_STATES, zonedInstant } from '@ota/domain';
import type { DisruptionSeverity, TravelerSafety } from '@ota/domain';
import type { AdvisoryDto, DisruptionOptionDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  Radio,
  RadioGroup,
  Select,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/**
 * A-Disruption's desk actions (M8). Each posts one change to the case and
 * refreshes the server-rendered page, which re-derives the counts, the red
 * "Unknown" and the call list.
 */
function useCaseAction(caseId: string) {
  const t = useTranslations('disruptionsDesk');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT',
    body: unknown,
    then?: (result: T) => void,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<T>(`/disruptions/${caseId}${path}`, {
        method,
        body: JSON.stringify(body),
      });
      if (then) {
        then(result);
      } else {
        router.refresh();
      }
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actionFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const failure = error ? <Alert variant="destructive">{error}</Alert> : null;
  return { run, busy, failure };
}

export function SeverityControl({
  caseId,
  severity,
}: {
  caseId: string;
  severity: DisruptionSeverity;
}) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  const [value, setValue] = useState<DisruptionSeverity>(severity);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run('', 'PATCH', { severity: value });
      }}
    >
      <RadioGroup legend={t('severityCard.title')} className="gap-2">
        {DISRUPTION_SEVERITIES.map((level) => (
          <Radio
            key={level}
            name="severity"
            value={level}
            checked={value === level}
            onChange={() => setValue(level)}
            label={t(`severities.${level}`)}
            description={t(`severityRules.${level}`)}
          />
        ))}
      </RadioGroup>
      <div>
        <Button type="submit" variant="secondary" disabled={busy || value === severity}>
          {t('severityCard.save')}
        </Button>
      </div>
      {failure}
    </form>
  );
}

export function CaseHeaderActions({
  caseId,
  actorId,
  ownerId,
}: {
  caseId: string;
  actorId: string;
  ownerId: string | null;
}) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  const [closing, setClosing] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {ownerId !== actorId ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run('', 'PATCH', { ownerId: actorId })}
          >
            {t('header.takeOver')}
          </Button>
        ) : null}
        {closing ? (
          <>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => run('', 'PATCH', { close: true })}
            >
              {t('header.close')}
            </Button>
            <Button variant="tertiary" onClick={() => setClosing(false)}>
              {t('header.cancel')}
            </Button>
          </>
        ) : (
          <Button variant="tertiary" disabled={busy} onClick={() => setClosing(true)}>
            {t('header.close')}
          </Button>
        )}
      </div>
      {closing ? (
        <p className="text-body-sm text-secondary">{t('header.confirmClose')}</p>
      ) : null}
      {failure}
    </div>
  );
}

export function StepDoneButton({ caseId, stepId }: { caseId: string; stepId: string }) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => run(`/steps/${stepId}/done`, 'POST', {})}
      >
        {t('playbook.markDone')}
      </Button>
      {failure}
    </div>
  );
}

const KEYS = ['A', 'B', 'C', 'D'] as const;

export function OptionsEditor({
  caseId,
  options,
}: {
  caseId: string;
  options: DisruptionOptionDto[];
}) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  const [rows, setRows] = useState(
    options.map((option) => ({ title: option.title, detail: option.detail })),
  );
  const update = (index: number, field: 'title' | 'detail', value: string) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, [field]: value } : row)),
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run('/options', 'PUT', {
          options: rows.map((row, index) => ({ key: KEYS[index], ...row })),
        });
      }}
    >
      {rows.map((row, index) => {
        const key = KEYS[index] ?? 'A';
        return (
          <fieldset
            key={key}
            className="flex min-w-0 flex-col gap-2 rounded-md border p-3"
          >
            <legend className="px-1 font-mono text-body-sm font-semibold">{key}</legend>
            <Field
              id={`option-${key}-title`}
              label={t('options.optionTitle', { key: key })}
            >
              {(control) => (
                <Input
                  {...control}
                  value={row.title}
                  maxLength={160}
                  required
                  onChange={(event) => update(index, 'title', event.target.value)}
                />
              )}
            </Field>
            <Field
              id={`option-${key}-detail`}
              label={t('options.optionDetail', { key: key })}
            >
              {(control) => (
                <Input
                  {...control}
                  value={row.detail}
                  maxLength={500}
                  required
                  onChange={(event) => update(index, 'detail', event.target.value)}
                />
              )}
            </Field>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {rows.length < KEYS.length ? (
          <Button
            type="button"
            variant="tertiary"
            onClick={() => setRows((current) => [...current, { title: '', detail: '' }])}
          >
            {t('options.add')}
          </Button>
        ) : null}
        {rows.length > 1 ? (
          <Button
            type="button"
            variant="tertiary"
            onClick={() => setRows((current) => current.slice(0, -1))}
          >
            {t('options.remove', { key: KEYS[rows.length - 1] ?? '' })}
          </Button>
        ) : null}
        <Button type="submit" variant="secondary" disabled={busy || rows.length === 0}>
          {t('options.save')}
        </Button>
      </div>
      {failure}
    </form>
  );
}

export interface SendTarget {
  reservationId: string;
  label: string;
  answered: boolean;
}

export function SendOptionsForm({
  caseId,
  optionKeys,
  targets,
  defaultDeadline,
  defaultKey,
}: {
  caseId: string;
  optionKeys: string[];
  targets: SendTarget[];
  /** A `datetime-local` value in Havana time, computed on the server. */
  defaultDeadline: string;
  defaultKey: string;
}) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [key, setKey] = useState(defaultKey);
  const [chosen, setChosen] = useState<string[]>(
    targets.filter((target) => !target.answered).map((target) => target.reservationId),
  );

  if (targets.length === 0) {
    return <p className="text-body-sm text-muted">{t('send.noRecipients')}</p>;
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const instant = zonedInstant(deadline);
        if (!instant) return;
        void run('/send-options', 'POST', {
          deadline: instant.toISOString(),
          defaultOptionKey: key,
          reservationIds: chosen,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="options-deadline" label={t('send.deadline')}>
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              value={deadline}
              required
              onChange={(event) => setDeadline(event.target.value)}
            />
          )}
        </Field>
        <Field id="options-default" label={t('send.default')}>
          {(control) => (
            <Select
              {...control}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            >
              {optionKeys.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <RadioGroup legend={t('send.recipients')} className="gap-1">
        {targets.map((target) => (
          <Checkbox
            key={target.reservationId}
            label={target.label}
            description={target.answered ? t('send.answered') : undefined}
            disabled={target.answered}
            checked={chosen.includes(target.reservationId)}
            onChange={(event) =>
              setChosen((current) =>
                event.target.checked
                  ? [...current, target.reservationId]
                  : current.filter((id) => id !== target.reservationId),
              )
            }
          />
        ))}
      </RadioGroup>
      <div>
        <Button type="submit" disabled={busy || chosen.length === 0}>
          {t('send.submit', { count: chosen.length })}
        </Button>
      </div>
      <p className="text-caption text-muted">{t('send.channels')}</p>
      {failure}
    </form>
  );
}

export function SafetyForm({
  caseId,
  reservationId,
  bookingCode,
  safety,
}: {
  caseId: string;
  reservationId: string;
  bookingCode: string;
  safety: TravelerSafety;
}) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  const [value, setValue] = useState<TravelerSafety>(
    safety === 'UNKNOWN' ? 'SAFE' : safety,
  );
  const [note, setNote] = useState('');

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void run(`/bookings/${reservationId}/safety`, 'POST', {
          safety: value,
          ...(note.trim() ? { note: note.trim() } : {}),
        }).then((saved) => {
          if (saved) setNote('');
        });
      }}
    >
      <Select
        aria-label={`${t('board.statusLabel')} · ${bookingCode}`}
        className="w-40"
        value={value}
        onChange={(event) => setValue(event.target.value as TravelerSafety)}
      >
        {TRAVELER_SAFETY_STATES.map((state) => (
          <option key={state} value={state}>
            {t(`board.safety.${state}`)}
          </option>
        ))}
      </Select>
      <Input
        aria-label={`${t('board.note')} · ${bookingCode}`}
        placeholder={t('board.notePlaceholder')}
        value={note}
        className="min-w-48 flex-1 sm:max-w-xs"
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        {t('board.saveStatus')}
      </Button>
      {failure ? <div className="w-full">{failure}</div> : null}
    </form>
  );
}

export function DeskChoiceForm({
  caseId,
  reservationId,
  bookingCode,
  optionKeys,
  defaultKey,
  canConfirmDefault,
}: {
  caseId: string;
  reservationId: string;
  bookingCode: string;
  optionKeys: string[];
  defaultKey: string | null;
  /** The deadline passed with no answer: the default may be confirmed. */
  canConfirmDefault: boolean;
}) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  const [key, setKey] = useState(defaultKey ?? optionKeys[0] ?? 'A');

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(`/bookings/${reservationId}/choice`, 'POST', { key, source: 'DESK' });
        }}
      >
        <Select
          aria-label={`${t('board.answerLabel')} · ${bookingCode}`}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          className="w-20"
        >
          {optionKeys.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          {t('board.recordAnswer')}
        </Button>
      </form>
      {canConfirmDefault && defaultKey ? (
        <div>
          <Button
            size="sm"
            variant="tertiary"
            disabled={busy}
            onClick={() =>
              run(`/bookings/${reservationId}/choice`, 'POST', {
                key: defaultKey,
                source: 'DEFAULT',
              })
            }
          >
            {t('board.confirmDefault', { key: defaultKey })}
          </Button>
        </div>
      ) : null}
      {failure}
    </div>
  );
}

export function AttachForm({
  caseId,
  suggestions,
}: {
  caseId: string;
  suggestions: { reservationId: string; label: string }[];
}) {
  const t = useTranslations('disruptionsDesk');
  const { run, busy, failure } = useCaseAction(caseId);
  const [chosen, setChosen] = useState<string[]>(
    suggestions.map((suggestion) => suggestion.reservationId),
  );
  const [code, setCode] = useState('');

  return (
    <div className="flex flex-col gap-4">
      {suggestions.length > 0 ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run('/bookings', 'POST', { reservationIds: chosen });
          }}
        >
          <div className="flex flex-col gap-1">
            {suggestions.map((suggestion) => (
              <Checkbox
                key={suggestion.reservationId}
                label={suggestion.label}
                checked={chosen.includes(suggestion.reservationId)}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked
                      ? [...current, suggestion.reservationId]
                      : current.filter((id) => id !== suggestion.reservationId),
                  )
                }
              />
            ))}
          </div>
          <div>
            <Button
              type="submit"
              variant="secondary"
              disabled={busy || chosen.length === 0}
            >
              {t('attach.selected')}
            </Button>
          </div>
        </form>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run('/bookings', 'POST', { bookingCodes: [code.trim()] }).then((saved) => {
            if (saved) setCode('');
          });
        }}
      >
        <Field
          id="attach-code"
          label={t('attach.code')}
          className="min-w-0 flex-1 sm:max-w-xs"
        >
          {(control) => (
            <Input
              {...control}
              value={code}
              required
              minLength={4}
              maxLength={20}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || code.trim().length < 4}
        >
          {t('attach.byCode')}
        </Button>
      </form>
      {failure}
    </div>
  );
}

export function DraftBannerButton({ caseId }: { caseId: string }) {
  const t = useTranslations('disruptionsDesk');
  const router = useRouter();
  const { run, busy, failure } = useCaseAction(caseId);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run<AdvisoryDto>('/advisory', 'POST', {}, (advisory) =>
              router.push(`/content/advisories/${advisory.id}`),
            )
          }
        >
          {t('comms.draft')}
        </Button>
      </div>
      {failure}
    </div>
  );
}
