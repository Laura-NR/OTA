'use client';

import type { ParamValue, TelemetryEventName } from '@ota/domain';
import { useEffect, useRef } from 'react';

import { useTelemetry } from './telemetry-provider';

/**
 * Fires one event when it mounts, for events that are a render rather than
 * a click (`package_viewed`, `booking_confirmed`, `error_page_shown`). A
 * server page renders it with the ids it already has.
 */
export function TrackEvent({
  event,
  params,
}: {
  event: TelemetryEventName;
  params?: Record<string, ParamValue>;
}) {
  const { track } = useTelemetry();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) {
      return;
    }
    sent.current = true;
    track(event, params);
  }, [event, params, track]);

  return null;
}
