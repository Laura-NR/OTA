'use client';

import { DISRUPTION_SEVERITIES } from '@ota/domain';
import type { DisruptionSeverity } from '@ota/domain';
import type { DisruptionCaseDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Field,
  Input,
  Radio,
  RadioGroup,
  Select,
  Textarea,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export interface ScenarioChoice {
  key: string;
  label: string;
  trigger: string;
}

/**
 * Opening a case (A-Disruption "New case"): the scenario picks the playbook,
 * options and compensation rule the case copies; severity is the desk's call.
 */
export function DisruptionCreateForm({
  scenarios,
  provinces,
}: {
  scenarios: ScenarioChoice[];
  provinces: { code: string; name: string }[];
}) {
  const t = useTranslations('disruptionsDesk');
  const router = useRouter();
  const [scenario, setScenario] = useState(scenarios[0]?.key ?? '');
  const [severity, setSeverity] = useState<DisruptionSeverity>('MINOR');
  const [province, setProvince] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const opened = await apiRequest<DisruptionCaseDto>('/disruptions', {
        method: 'POST',
        body: JSON.stringify({
          scenario,
          severity,
          province: province || null,
          title: title.trim(),
          summary: summary.trim(),
        }),
      });
      router.push(`/disruptions/${opened.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('form.failed'));
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <RadioGroup legend={t('form.scenario')} className="gap-2">
        <p className="mb-1 text-body-sm text-muted">{t('form.scenarioHint')}</p>
        {scenarios.map((choice) => (
          <Radio
            key={choice.key}
            name="scenario"
            value={choice.key}
            checked={scenario === choice.key}
            onChange={() => setScenario(choice.key)}
            label={choice.label}
            description={t('form.trigger', { trigger: choice.trigger })}
          />
        ))}
      </RadioGroup>

      <RadioGroup legend={t('severity')} className="gap-2">
        {DISRUPTION_SEVERITIES.map((level) => (
          <Radio
            key={level}
            name="severity"
            value={level}
            checked={severity === level}
            onChange={() => setSeverity(level)}
            label={t(`severities.${level}`)}
            description={t(`severityRules.${level}`)}
          />
        ))}
      </RadioGroup>

      <Field id="case-province" label={t('form.province')}>
        {(control) => (
          <Select
            {...control}
            value={province}
            onChange={(event) => setProvince(event.target.value)}
            className="sm:max-w-xs"
          >
            <option value="">{t('form.notRegional')}</option>
            {provinces.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id="case-title" label={t('form.title')}>
        {(control) => (
          <Input
            {...control}
            value={title}
            maxLength={160}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
      </Field>

      <Field id="case-summary" label={t('form.summary')} hint={t('form.summaryHint')}>
        {(control) => (
          <Textarea
            {...control}
            value={summary}
            maxLength={2000}
            rows={4}
            required
            onChange={(event) => setSummary(event.target.value)}
          />
        )}
      </Field>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div>
        <Button
          type="submit"
          disabled={busy || !scenario || !title.trim() || !summary.trim()}
        >
          {t('form.open')}
        </Button>
      </div>
    </form>
  );
}
