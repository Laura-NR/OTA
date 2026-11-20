'use client';

import {
  currentJobStep,
  jobStepsFor,
  zonedInstant,
  zonedWallClock,
  type JobStep,
  type JobStepTimes,
  type ServiceType,
} from '@ota/domain';
import type { JobBriefDto, JobStepTimesDto, ReservationDeskItemDto } from '@ota/schemas';
import { Alert, Button, Dialog, Input, Label, Select, Textarea } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** The steps a service still takes: those after the latest one recorded (J2). */
export function nextSteps(serviceType: ServiceType, steps: JobStepTimesDto): JobStep[] {
  const times: JobStepTimes = {
    EN_ROUTE: steps.EN_ROUTE ? new Date(steps.EN_ROUTE) : null,
    ARRIVED: steps.ARRIVED ? new Date(steps.ARRIVED) : null,
    STARTED: steps.STARTED ? new Date(steps.STARTED) : null,
    FINISHED: steps.FINISHED ? new Date(steps.FINISHED) : null,
  };
  const all = jobStepsFor(serviceType);
  const current = currentJobStep(times);
  return current ? all.slice(all.indexOf(current) + 1) : [...all];
}

/**
 * "Brief…" (W-Job J1): where the worker meets the travelers, where the job
 * ends and the notes they read in the app. An emptied field is cleared.
 */
export function BriefButton({
  item,
  label,
}: {
  item: ReservationDeskItemDto;
  /** "Brief for the worker · {service} · {code}", for the button and the dialog. */
  label: string;
}) {
  const t = useTranslations('backoffice.reservation.services');
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiRequest<JobBriefDto>(`/service-items/${item.id}/brief`, {
        method: 'PATCH',
        body: JSON.stringify({
          meetingPoint: String(form.get('meetingPoint') ?? ''),
          dropOff: String(form.get('dropOff') ?? ''),
          workerBrief: String(form.get('workerBrief') ?? ''),
        }),
      });
      setOpen(false);
      router.refresh();
    } catch (saveError) {
      setError(
        t('failed', {
          message: saveError instanceof Error ? saveError.message : String(saveError),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        {t('brief')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('briefTitle')}
        description={t('briefDescription')}
        closeLabel={t('close')}
      >
        {open ? (
          <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
            <p className="text-caption text-muted">{label}</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-meeting`}>{t('meetingPoint')}</Label>
              <Input
                id={`${id}-meeting`}
                name="meetingPoint"
                maxLength={500}
                defaultValue={item.brief.meetingPoint ?? ''}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-drop`}>{t('dropOff')}</Label>
              <Input
                id={`${id}-drop`}
                name="dropOff"
                maxLength={500}
                defaultValue={item.brief.dropOff ?? ''}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-notes`}>{t('workerBrief')}</Label>
              <Textarea
                id={`${id}-notes`}
                name="workerBrief"
                maxLength={500}
                rows={4}
                aria-describedby={`${id}-hint`}
                defaultValue={item.brief.workerBrief ?? ''}
              />
              <p id={`${id}-hint`} className="text-caption text-muted">
                {t('workerBriefHint')}
              </p>
            </div>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={busy}>
                {t('briefSave')}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}

/**
 * "Record step…" (W-Job J4): a step the worker phoned in, at the time they
 * gave, in Havana time. Only the steps after the latest one are offered.
 */
export function RecordStepButton({
  item,
  label,
  now,
}: {
  item: ReservationDeskItemDto;
  label: string;
  now: Date;
}) {
  const t = useTranslations('backoffice.reservation.services');
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steps = nextSteps(item.serviceType, item.steps);
  if (steps.length === 0) {
    return null;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const at = zonedInstant(String(form.get('at') ?? ''));
    if (!at) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest<JobStepTimesDto>(`/service-items/${item.id}/steps`, {
        method: 'POST',
        body: JSON.stringify({ step: form.get('step'), occurredAt: at.toISOString() }),
      });
      setOpen(false);
      router.refresh();
    } catch (saveError) {
      setError(
        t('failed', {
          message: saveError instanceof Error ? saveError.message : String(saveError),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        {t('recordStep')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('stepTitle')}
        description={t('stepDescription')}
        closeLabel={t('close')}
        size="sm"
      >
        {open ? (
          <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
            <p className="text-caption text-muted">{label}</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-step`}>{t('stepField')}</Label>
              <Select id={`${id}-step`} name="step" defaultValue={steps[0]}>
                {steps.map((step) => (
                  <option key={step} value={step}>
                    {t(`steps.${step}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-at`}>{t('stepTime')}</Label>
              <Input
                id={`${id}-at`}
                name="at"
                type="datetime-local"
                required
                defaultValue={zonedWallClock(now)}
              />
            </div>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={busy}>
                {t('stepSave')}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
