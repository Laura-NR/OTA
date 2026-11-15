/**
 * W-Job (`docs/schema-w-job.md`, approved J1–J9): the steps a worker taps
 * on a job, the on-site emergency report and its SMS, and the local contact
 * the job shows. Pure: the API stores, the app queues and sends.
 */

import { serviceCalendarDay } from '../dispatch/availability';
import { zonedWallClock } from '../time/ops-calendar';
import { fitsOneSmsSegment } from './sms';
import { normalizeWorkerPhone } from './sign-in';

/** A job's steps, in order (J2). */
export const JOB_STEPS = ['EN_ROUTE', 'ARRIVED', 'STARTED', 'FINISHED'] as const;
export type JobStep = (typeof JOB_STEPS)[number];

/** The service types a job can be, as `ServiceType` names them. */
export type JobServiceType = 'GUIDE' | 'TRANSPORTATION' | 'ACCOMMODATION' | 'EXPERIENCE';

/**
 * The steps a service type uses. A host has no journey: their guests arrive
 * and leave, so only the last two steps apply.
 */
export function jobStepsFor(serviceType: JobServiceType): readonly JobStep[] {
  return serviceType === 'ACCOMMODATION' ? ['STARTED', 'FINISHED'] : JOB_STEPS;
}

/** When each step was recorded; null until it is. */
export type JobStepTimes = Record<JobStep, Date | null>;

/** The latest step recorded, or null before the first. */
export function currentJobStep(times: JobStepTimes): JobStep | null {
  for (let index = JOB_STEPS.length - 1; index >= 0; index -= 1) {
    const step = JOB_STEPS[index]!;
    if (times[step]) return step;
  }
  return null;
}

/**
 * How far ahead of the API's clock a step's time may be: the app corrects
 * the phone's clock by the last home's, which is a little old.
 */
export const JOB_STEP_CLOCK_TOLERANCE_MS = 2 * 60_000;

/**
 * Why a step cannot be recorded, or null when it can:
 * - `not_for_type`: the service type does not use this step;
 * - `in_future`: its time is ahead of the API's clock;
 * - `before_acceptance`: its time is before the worker accepted the job;
 * - `later_step_recorded`: a later step is already in, and steps never go back.
 *
 * A step already recorded is not a refusal: the API returns its first time
 * (J2), so a resent tap changes nothing.
 */
export type JobStepRefusal =
  'not_for_type' | 'in_future' | 'before_acceptance' | 'later_step_recorded';

export function jobStepRefusal(input: {
  step: JobStep;
  serviceType: JobServiceType;
  at: Date;
  now: Date;
  /** When the worker accepted; null when it is not known. */
  acceptedAt: Date | null;
  times: JobStepTimes;
}): JobStepRefusal | null {
  const { step, serviceType, at, now, acceptedAt, times } = input;
  if (!jobStepsFor(serviceType).includes(step)) return 'not_for_type';
  if (at.getTime() > now.getTime() + JOB_STEP_CLOCK_TOLERANCE_MS) return 'in_future';
  if (acceptedAt && at.getTime() < acceptedAt.getTime() - JOB_STEP_CLOCK_TOLERANCE_MS) {
    return 'before_acceptance';
  }
  const later = JOB_STEPS.slice(JOB_STEPS.indexOf(step) + 1);
  if (!times[step] && later.some((next) => times[next])) return 'later_step_recorded';
  return null;
}

/** The last step finishes the job (J3): the item becomes `FULFILLED`. */
export function finishesJob(step: JobStep): boolean {
  return step === 'FINISHED';
}

/** The board's four emergency types (J5). */
export const EMERGENCY_CATEGORIES = [
  'MEDICAL',
  'MECHANICAL',
  'SECURITY',
  'OTHER',
] as const;
export type EmergencyCategory = (typeof EMERGENCY_CATEGORIES)[number];

/** Every worker's report starts critical; the desk may lower it (J5). */
export const EMERGENCY_SEVERITY = 'CRITICAL';

/** The category in the SMS: Spanish, in capitals and without accents (ADR 0007). */
const SMS_CATEGORY: Record<EmergencyCategory, string> = {
  MEDICAL: 'MEDICA',
  MECHANICAL: 'MECANICA',
  SECURITY: 'SEGURIDAD',
  OTHER: 'OTRA',
};

export interface EmergencyPosition {
  latitude: number;
  longitude: number;
  /** Metres, as the phone reports it; null when unknown. */
  accuracyM: number | null;
}

/** Strips what GSM-7 cannot carry from a name: accents, then anything else. */
function gsmName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9 .'-]/g, '')
    .trim();
}

/**
 * The SOS SMS the worker's phone sends to the desk with no data (J6): the
 * booking, the type, the position (five decimals, about a metre), the time
 * in Havana and the worker's first name, as one GSM-7 segment. The name is
 * cut first if the text would not fit.
 */
export function emergencySms(input: {
  bookingCode: string;
  category: EmergencyCategory;
  position: EmergencyPosition | null;
  at: Date;
  workerFirstName: string | null;
}): string {
  const where = input.position
    ? `${input.position.latitude.toFixed(5)},${input.position.longitude.toFixed(5)}` +
      (input.position.accuracyM === null
        ? ''
        : ` (${Math.round(input.position.accuracyM)} m)`)
    : 'sin ubicacion';
  const time = zonedWallClock(input.at).slice(11, 16);
  const head = `SOS ${input.bookingCode} ${SMS_CATEGORY[input.category]} ${where} ${time}`;
  let name = gsmName(input.workerFirstName ?? '');
  while (name && !fitsOneSmsSegment(`${head} ${name}`)) name = name.slice(0, -1).trim();
  return name ? `${head} ${name}` : head;
}

/** A stay booked on the same trip, as the job's contact rule reads it. */
export interface JobStay {
  startsAt: Date;
  endsAt: Date;
  hostFirstName: string | null;
  hostPhone: string | null;
}

/**
 * The host of the night the job starts (J8): the stay whose nights cover
 * that day (stays are stored as calendar dates, a job's time is read in
 * Havana; `serviceCalendarDay`), with a Cuban phone. A foreign or missing phone shows
 * no contact, since a worker receives only local numbers (spec §8.2).
 */
export function jobNightHost(
  jobStartsAt: Date,
  stays: readonly JobStay[],
): { firstName: string | null; phone: string } | null {
  const day = serviceCalendarDay(jobStartsAt);
  for (const stay of stays) {
    if (
      day < serviceCalendarDay(stay.startsAt) ||
      day >= serviceCalendarDay(stay.endsAt)
    ) {
      continue;
    }
    const phone = stay.hostPhone ? normalizeWorkerPhone(stay.hostPhone) : null;
    if (!phone || !phone.startsWith('+53')) continue;
    return { firstName: stay.hostFirstName, phone };
  }
  return null;
}
