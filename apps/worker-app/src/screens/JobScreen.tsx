import {
  currentJobStep,
  jobStepsDue,
  jobStepsFor,
  serviceCalendarDays,
  workerToday,
  type EmergencyCategory,
  type JobAction,
  type JobStep,
  type JobStepTimes,
} from '@ota/domain';
import type { WorkerJobDto } from '@ota/schemas';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { settings } from '../lib/config';
import { EMERGENCY_TYPES, copy, stepWords } from '../lib/copy';
import {
  calendarDate,
  clock,
  money,
  serviceLabel,
  shortDate,
  travelerLine,
} from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

/** How the emergency report went out: through the API, or the SMS composer opened. */
export interface EmergencyOutcome {
  category: EmergencyCategory;
  at: string;
  delivered: boolean;
}

function call(phone: string) {
  void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
}

/**
 * W-Job (`docs/schema-w-job.md`): the job readable with no signal, its steps
 * saved on the phone with their time and sent when the signal returns, and
 * the on-site emergency: the desk's call, a report with the position (by the
 * API, or by SMS when there is no data) and the public numbers; a message to
 * the desk about the job opens the thread. `now` is the
 * API's clock as the app tracks it.
 */
export function JobScreen({
  job,
  now,
  offline,
  savedAt,
  queued,
  onStep,
  onEmergency,
  onSms,
  onMessage,
  onBack,
}: {
  job: WorkerJobDto;
  now: number;
  offline: boolean;
  /** When the phone last read the jobs from the API. */
  savedAt: string;
  /** This job's steps and reports still waiting on the phone. */
  queued: readonly JobAction[];
  onStep: (step: JobStep) => Promise<void>;
  onEmergency: (category: EmergencyCategory) => Promise<EmergencyOutcome>;
  onSms: (outcome: EmergencyOutcome) => void;
  /** The thread with the desk, about this job (`docs/schema-w-messages.md` M2). */
  onMessage: () => void;
  onBack: () => void;
}) {
  const [sheet, setSheet] = useState(false);
  const [category, setCategory] = useState<EmergencyCategory>('MEDICAL');
  const [locating, setLocating] = useState(false);
  const [outcome, setOutcome] = useState<EmergencyOutcome | null>(null);
  const [busyStep, setBusyStep] = useState<JobStep | null>(null);

  const saved: Partial<Record<JobStep, string>> = {};
  for (const action of queued) {
    if (action.kind === 'step') saved[action.step] ??= action.occurredAt;
  }
  const times: JobStepTimes = {
    EN_ROUTE: null,
    ARRIVED: null,
    STARTED: null,
    FINISHED: null,
  };
  for (const step of jobStepsFor(job.serviceType)) {
    const at = job.steps?.[step] ?? saved[step];
    times[step] = at ? new Date(at) : null;
  }
  const current = currentJobStep(times);
  const steps = jobStepsFor(job.serviceType);
  const later = current ? steps.slice(steps.indexOf(current) + 1) : steps;
  const due = jobStepsDue(new Date(job.startsAt), new Date(now));
  // "Trabajo de hoy" on any day the service runs, as a multi-day tour does.
  const today = serviceCalendarDays(
    new Date(job.startsAt),
    new Date(job.endsAt),
  ).includes(workerToday(new Date(now)));

  async function step(name: JobStep) {
    setBusyStep(name);
    try {
      await onStep(name);
    } finally {
      setBusyStep(null);
    }
  }

  async function notify() {
    setLocating(true);
    try {
      setOutcome(await onEmergency(category));
      setSheet(false);
    } finally {
      setLocating(false);
    }
  }

  const kind = (key: EmergencyCategory) =>
    EMERGENCY_TYPES.find((option) => option.key === key)!.short;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Button label={`‹ ${copy.job.back}`} variant="quiet" onPress={onBack} />
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.title, styles.grow]}>
          {today ? copy.job.today : copy.job.on(shortDate(job.startsAt))}
        </Text>
        <Text
          style={[
            type.caption,
            styles.chip,
            offline ? styles.chipOffline : styles.chipOnline,
          ]}
        >
          {offline ? copy.job.savedAt(clock(savedAt)) : copy.job.synced}
        </Text>
      </View>

      {outcome ? (
        <Card style={styles.alertCard}>
          <Text accessibilityRole="alert" style={type.heading}>
            {copy.job.notified(clock(outcome.at), kind(outcome.category))}
          </Text>
          <Text style={type.body}>
            {outcome.delivered ? copy.job.notifiedText : copy.job.notifiedSms}
          </Text>
          {settings.deskPhone ? (
            <Button
              label={copy.job.callNow}
              variant="danger"
              onPress={() => call(settings.deskPhone!)}
            />
          ) : (
            <Notice tone="danger">{copy.job.noDeskPhone}</Notice>
          )}
          {outcome.delivered && settings.deskPhone ? (
            <Button
              label={copy.job.smsAgain}
              variant="secondary"
              onPress={() => onSms(outcome)}
            />
          ) : null}
        </Card>
      ) : null}

      {sheet ? (
        <Card style={styles.alertCard}>
          <Text accessibilityRole="header" style={type.heading}>
            {copy.job.emergencyTitle}
          </Text>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {EMERGENCY_TYPES.map((option) => {
              const selected = option.key === category;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setCategory(option.key)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={[styles.dot, selected && styles.dotSelected]} />
                  <Text style={[type.body, styles.grow]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            label={locating ? copy.job.locating : copy.job.emergencyNotify}
            variant="danger"
            busy={locating}
            onPress={() => void notify()}
          />
          {settings.deskPhone ? (
            <Button
              label={copy.job.emergencyCallDesk}
              variant="secondary"
              onPress={() => call(settings.deskPhone!)}
            />
          ) : null}
          <View style={styles.numbers}>
            {copy.job.emergencyNumbers.map((number) => (
              <View key={number.phone} style={styles.number}>
                <Button
                  label={number.label}
                  variant="secondary"
                  onPress={() => call(number.phone)}
                />
              </View>
            ))}
          </View>
          <Button
            label={copy.job.cancel}
            variant="quiet"
            onPress={() => setSheet(false)}
          />
        </Card>
      ) : (
        <Button
          label={copy.job.emergency}
          variant="danger"
          onPress={() => {
            setOutcome(null);
            setSheet(true);
          }}
        />
      )}

      <Text style={type.heading}>{copy.job.state[current ?? 'none']}</Text>

      <Card>
        <Text style={[type.heading, type.figure]}>
          {clock(job.startsAt)} · {serviceLabel(job.serviceType)}
          {job.province ? ` · ${job.province}` : ''}
        </Text>
        <Detail label={copy.job.travelers}>{travelerLine(job.traveler)}</Detail>
        {job.brief?.meetingPoint ? (
          <Detail label={copy.job.meetingPoint}>{job.brief.meetingPoint}</Detail>
        ) : null}
        {job.brief?.dropOff ? (
          <Detail label={copy.job.dropOff}>{job.brief.dropOff}</Detail>
        ) : null}
        <Detail label={copy.job.brief}>
          {job.brief?.workerBrief ?? copy.job.noBrief}
        </Detail>
        <Detail label={copy.job.pay}>
          {money(job.payout, job.currency)} · {job.bookingCode}
        </Detail>
      </Card>

      <Card>
        <Text accessibilityRole="header" style={type.heading}>
          {copy.job.contacts}
        </Text>
        {job.nightHost ? (
          <Button
            label={copy.job.call(copy.job.host(job.nightHost.firstName))}
            variant="secondary"
            onPress={() => call(job.nightHost!.phone)}
          />
        ) : null}
        {settings.deskPhone ? (
          <Button
            label={copy.job.call(`${copy.job.desk} · ${settings.deskPhone}`)}
            variant="secondary"
            onPress={() => call(settings.deskPhone!)}
          />
        ) : null}
        <Button label={copy.messages.job} variant="secondary" onPress={onMessage} />
        <Text style={type.caption}>{copy.job.privacy}</Text>
      </Card>

      <Card>
        <Text accessibilityRole="header" style={type.heading}>
          {copy.job.steps}
        </Text>
        {job.stepsOpen === false ? (
          <Notice tone="info">{copy.job.stepsClosed}</Notice>
        ) : !due ? (
          <Notice tone="info">{copy.job.stepsLater(calendarDate(job.startsAt))}</Notice>
        ) : null}
        {steps.map((name, index) => {
          const words = stepWords(job.serviceType, name);
          const done = times[name];
          const fromServer = job.steps?.[name];
          const open = job.stepsOpen !== false && due && !done && later.includes(name);
          return (
            <View key={name} style={styles.step}>
              <Text style={[type.body, styles.stepNumber, done && styles.stepDone]}>
                {index + 1}
              </Text>
              <View style={styles.grow}>
                <Text style={[type.body, styles.strong]}>{words.label}</Text>
                {done ? (
                  <Text style={type.small}>
                    {fromServer
                      ? copy.job.stepDone(clock(fromServer))
                      : copy.job.stepQueued(clock(done.toISOString()))}
                  </Text>
                ) : null}
                {open ? (
                  <Button
                    label={words.action}
                    variant={name === later[0] ? 'primary' : 'secondary'}
                    busy={busyStep === name}
                    disabled={busyStep !== null}
                    onPress={() => void step(name)}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
        <Text style={type.caption}>{copy.job.stepsNote}</Text>
      </Card>
    </ScrollView>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.detail}>
      <Text style={type.caption}>{label}</Text>
      <Text style={type.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '700' },
  chip: {
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    overflow: 'hidden',
  },
  chipOnline: { color: colors.success, backgroundColor: colors.successSoft },
  chipOffline: { color: colors.warning, backgroundColor: colors.warningSoft },
  alertCard: { borderColor: colors.danger, borderWidth: 2 },
  options: { gap: space.sm },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.danger, backgroundColor: colors.surface },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.inkSoft,
  },
  dotSelected: { borderColor: colors.danger, backgroundColor: colors.danger },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  number: { flexGrow: 1, flexBasis: 96 },
  detail: { gap: 2 },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 28,
    height: 28,
    lineHeight: 26,
    textAlign: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.inkSoft,
    overflow: 'hidden',
  },
  stepDone: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
    color: colors.success,
  },
});
