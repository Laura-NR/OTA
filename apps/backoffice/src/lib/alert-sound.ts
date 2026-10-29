'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dispatched on `window` each time the desk plays a cue, with the level as
 * its detail, so an end-to-end test can tell a cue was played.
 */
export const ALERT_CUE_EVENT = 'ota:alert-cue';

/** A-A11y 01's "short two-note cue": red falls from high, amber is softer and lower. */
const CUES = {
  RED: { notes: [880, 660], gain: 0.25 },
  AMBER: { notes: [587, 494], gain: 0.12 },
} as const;

const NOTE_SECONDS = 0.16;
const GAP_SECONDS = 0.06;

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  const scope = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/**
 * The desk's alert cue, made with the Web Audio API (no sound file). Browsers
 * let a page play sound only once a person has interacted with it, so the cue
 * is not an autoplay: it starts with the first click or key press on the page
 * (A-A11y 01), or with `unlock` from a "Turn on sound" button. `ready` says
 * whether a cue can play now.
 */
export function useAlertSound() {
  const context = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false);

  const unlock = useCallback(() => {
    const Constructor = audioContextConstructor();
    if (!Constructor) {
      return;
    }
    try {
      context.current ??= new Constructor();
      const audio = context.current;
      void audio.resume().then(
        () => setReady(audio.state === 'running'),
        () => setReady(false),
      );
    } catch {
      // No audio on this device; the strip and the announcements still carry the alert.
    }
  }, []);

  useEffect(() => {
    if (ready) {
      return;
    }
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [ready, unlock]);

  useEffect(
    () => () => {
      void context.current?.close().catch(() => undefined);
      context.current = null;
    },
    [],
  );

  /** Play a cue; false when the page cannot sound yet. */
  const play = useCallback((level: keyof typeof CUES): boolean => {
    const audio = context.current;
    if (!audio || audio.state !== 'running') {
      return false;
    }
    const { notes, gain } = CUES[level];
    let start = audio.currentTime;
    for (const frequency of notes) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      // A short attack and release, so the notes do not click.
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(gain, start + 0.02);
      envelope.gain.linearRampToValueAtTime(0, start + NOTE_SECONDS);
      oscillator.connect(envelope).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + NOTE_SECONDS);
      start += NOTE_SECONDS + GAP_SECONDS;
    }
    window.dispatchEvent(new CustomEvent(ALERT_CUE_EVENT, { detail: level }));
    return true;
  }, []);

  return { ready, play, unlock };
}
