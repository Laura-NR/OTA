import { journeyPosition, TRAVELER_JOURNEY, type ReservationStatus } from '@ota/domain';
import { Stepper, type StepState } from '@ota/ui';
import { useTranslations } from 'next-intl';

/**
 * A booking's progress in the traveler's words (Account board's bar): the DS 03
 * labels from "Request received" to "Completed", the current step in ochre and
 * a step that waits on someone in red. A cancelled booking has no bar.
 */
export function TripProgress({ status }: { status: ReservationStatus }) {
  const t = useTranslations('status.traveler');
  const account = useTranslations('account');
  const position = journeyPosition(status);
  if (!position) {
    return null;
  }
  const steps = TRAVELER_JOURNEY.map((step, index) => {
    const state: StepState =
      index < position.index || (position.finished && index === position.index)
        ? 'done'
        : index === position.index
          ? position.blocked
            ? 'error'
            : 'current'
          : 'upcoming';
    return { id: step, label: t(step), state };
  });

  return (
    <Stepper
      steps={steps}
      progressLabel={account('progress', {
        step: position.index + 1,
        total: TRAVELER_JOURNEY.length,
        label: t(TRAVELER_JOURNEY[position.index]!),
      })}
    />
  );
}
