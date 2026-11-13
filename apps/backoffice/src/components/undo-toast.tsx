'use client';

import { Button, Icon } from '@ota/ui';
import { useEffect, useRef, useState } from 'react';

export interface UndoToastProps {
  message: string;
  undoLabel: string;
  /** How long the action can be undone. */
  durationMs: number;
  onUndo: () => void;
  /** The window closed without an undo: the action goes ahead. */
  onExpire: () => void;
}

/**
 * The optimistic "act with undo" toast (A-States, DS-Feedback-Nav): dark,
 * bottom centre, its countdown paused while the pointer or focus is on it so
 * nobody loses the Undo while reaching for it. The parent keys it by the
 * action, so a new action starts a new countdown.
 */
export function UndoToast({
  message,
  undoLabel,
  durationMs,
  onUndo,
  onExpire,
}: UndoToastProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(durationMs);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    if (hovered || focused) {
      return;
    }
    const started = Date.now();
    const timer = setTimeout(() => expire.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [hovered, focused]);

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-md bg-neutral-900 px-4 py-3 text-body-sm text-neutral-0 shadow-lg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      <Icon name="check" />
      <span className="min-w-0 flex-1">{message}</span>
      <Button
        size="sm"
        variant="tertiary"
        className="text-accent-500 hover:bg-neutral-700 hover:text-accent-500"
        onClick={onUndo}
      >
        {undoLabel}
      </Button>
    </div>
  );
}
