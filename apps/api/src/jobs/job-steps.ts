import { currentJobStep, type JobStepTimes } from '@ota/domain';
import type { CurrentJobStepDto, JobStepTimesDto } from '@ota/schemas';

/**
 * W-Job's step columns as the DTOs carry them (`docs/schema-w-job.md` J2,
 * J4). Kept apart from `JobsService` so the reservation and worker reads
 * import them without the service.
 */

/** The step times a row holds. */
export function jobStepTimes(row: {
  enRouteAt: Date | null;
  arrivedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}): JobStepTimes {
  return {
    EN_ROUTE: row.enRouteAt,
    ARRIVED: row.arrivedAt,
    STARTED: row.startedAt,
    FINISHED: row.finishedAt,
  };
}

/** The latest step and its time, as the desk and the traveler see it (J4). */
export function currentStepDto(
  row: Parameters<typeof jobStepTimes>[0],
): CurrentJobStepDto | null {
  const times = jobStepTimes(row);
  const step = currentJobStep(times);
  return step ? { step, at: times[step]!.toISOString() } : null;
}

/** The step times as the DTOs carry them. */
export function toJobStepTimesDto(times: JobStepTimes): JobStepTimesDto {
  return {
    EN_ROUTE: times.EN_ROUTE?.toISOString() ?? null,
    ARRIVED: times.ARRIVED?.toISOString() ?? null,
    STARTED: times.STARTED?.toISOString() ?? null,
    FINISHED: times.FINISHED?.toISOString() ?? null,
  };
}
