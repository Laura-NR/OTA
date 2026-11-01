'use client';

import {
  ALERT_ACK_UNDO_MS,
  ALERT_MUTE_MS,
  alertCrossings,
  alertCue,
  alertKey,
  muteSilences,
  redSince,
  timerElapsed,
  type DeskAlertMute,
  type EscalationAlert,
} from '@ota/domain';
import type {
  AlertAcknowledgementDto,
  DeskAlertMuteDto,
  DeskAlertMuteStateDto,
  DispatchBoardItemDto,
  DispatchBoardRowDto,
} from '@ota/schemas';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { shortcutsEnabled } from '@/components/desk-shortcuts';
import { useDeskTelemetry } from '@/components/telemetry/desk-telemetry';
import { useAlertSound } from '@/lib/alert-sound';
import { apiRequest } from '@/lib/client-api';
import { ApiError } from '@/lib/errors';
import { MATRIX_COLUMNS } from '@/lib/matrix-columns';
import { opsTime } from '@/lib/ops-format';
import { connectEscalation } from '@/lib/socket';

import { useDeskLocked } from './desk-idle-lock';
import { OPEN_ITEM_STATUSES, itemAlert } from './service-item-status';
import { UndoToast } from './undo-toast';

/** The dashboard, where the matrix and its own copy of the strip live. */
export const DASHBOARD_PATH = '/dashboard';

/** A red alert this desk acknowledged and may still undo (A-States). */
interface PendingAcknowledgement {
  seq: number;
  bookingCode: string;
  items: Array<{ id: string; offeredAt: string | null; raisedAt: Date | null }>;
}

export interface FlaggedItem {
  row: DispatchBoardRowDto;
  item: DispatchBoardItemDto;
  alert: EscalationAlert;
}

/** The latest crossings' sentences; `seq` re-keys them so a repeat is read again. */
export interface DeskAnnouncements {
  red: string;
  amber: string;
  seq: number;
}

export interface DeskAlertsValue {
  rows: DispatchBoardRowDto[];
  announced: DeskAnnouncements;
  now: Date;
  connected: boolean;
  amberThreshold: number;
  canManage: boolean;
  red: FlaggedItem[];
  amber: FlaggedItem[];
  mute: DeskAlertMuteDto | null;
  muteActive: boolean;
  muteBusy: boolean;
  alertError: string | null;
  soundReady: boolean;
  unlockSound: () => void;
  isAcknowledged: (item: DispatchBoardItemDto) => boolean;
  /** Acknowledge the row's unacknowledged red alerts, with the undo. */
  acknowledge: (row: DispatchBoardRowDto) => void;
  changeMute: (on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Take a board and mute state a server render just read (the dashboard's
   * own); null where the read failed, which keeps what the desk knows.
   */
  seed: (rows: DispatchBoardRowDto[] | null, mute: DeskAlertMuteStateDto | null) => void;
}

const DeskAlertsContext = createContext<DeskAlertsValue | null>(null);

/** The desk's live alerts; null outside a staff shell. */
export function useDeskAlerts(): DeskAlertsValue | null {
  return useContext(DeskAlertsContext);
}

const toDate = (value: string | null): Date | null => (value ? new Date(value) : null);

/** When a red item turned red, from the board's fields. */
function itemRedSince(item: DispatchBoardItemDto): Date | null {
  return redSince({
    status: item.status,
    deadline: toDate(item.deadline),
    respondedAt: toDate(item.respondedAt),
  });
}

function muteWindow(mute: DeskAlertMuteDto | null): DeskAlertMute | null {
  return mute
    ? { startedAt: new Date(mute.startedAt), until: new Date(mute.until) }
    : null;
}

export interface DeskAlertsProps {
  /** The board at render time; null when the API could not answer. */
  initialRows: DispatchBoardRowDto[] | null;
  /** The mute state at render time; null when the API could not answer. */
  initialMute: DeskAlertMuteStateDto | null;
  /** The request's time, so the first render matches the server's. */
  serverNow: number;
  amberThreshold: number;
  canManage: boolean;
  children: ReactNode;
}

/**
 * The desk's red and amber dispatch alerts on every shell page (A-A11y 01,
 * A-Dashboard), not only on the dashboard. It sits in the dashboard layout,
 * which stays mounted while the person moves between desk pages, so the feed,
 * the cue and what it has already cued carry over. It seeds from the API, then
 * follows the `/ops` socket; amber and red are recomputed every second from
 * each offer's deadline. A screen reader hears each threshold crossing once
 * (`AlertAnnouncements`, in the page's main): red in an assertive region,
 * amber in a polite one. The cue (`alertCue`)
 * sounds a red alert until someone on the desk acknowledges it, amber once;
 * "Mute 15 min" silences the alerts already raised. Acknowledgements wait out
 * a 6 s undo here before they are recorded; both they and the mute are the
 * desk's, from the audit log.
 */
export function DeskAlerts({
  initialRows,
  initialMute,
  serverNow,
  amberThreshold,
  canManage,
  children,
}: DeskAlertsProps) {
  const t = useTranslations('backoffice.dashboard');
  const locale = useLocale();
  const pathname = usePathname();
  const onDashboard = pathname === DASHBOARD_PATH;
  const onDashboardRef = useRef(onDashboard);
  onDashboardRef.current = onDashboard;
  const [rows, setRows] = useState(initialRows ?? []);
  const [nowMs, setNowMs] = useState(serverNow);
  const [connected, setConnected] = useState(false);
  const track = useDeskTelemetry();
  /** Each item's alert at the last tick; null until the first look. */
  const lastAlerts = useRef<Map<string, EscalationAlert> | null>(null);
  const [announced, setAnnounced] = useState<DeskAnnouncements>({
    red: '',
    amber: '',
    seq: 0,
  });
  const [mute, setMute] = useState(initialMute?.mute ?? null);
  const [muteBusy, setMuteBusy] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  /** The acknowledgement whose undo toast is open. */
  const [pendingAck, setPendingAck] = useState<PendingAcknowledgement | null>(null);
  const pendingAckRef = useRef<PendingAcknowledgement | null>(null);
  pendingAckRef.current = pendingAck;
  const ackSeq = useRef(0);
  /** Alerts acknowledged here and not yet back from the API, by `alertKey`. */
  const [localAcks, setLocalAcks] = useState<ReadonlySet<string>>(new Set());
  const sound = useAlertSound();
  /** The idle lock: no feed and no cue until the desk is unlocked. */
  const locked = useDeskLocked();
  /** The red alerts this desk has played a cue for, by `alertKey`. */
  const cued = useRef(new Set<string>());
  const lastRedCueAt = useRef<Date | null>(null);
  /** Amber crossings waiting for their one cue. */
  const amberToCue = useRef(0);

  async function refresh() {
    try {
      const [board, muteState] = await Promise.all([
        apiRequest<DispatchBoardRowDto[]>('/dispatch/active'),
        apiRequest<DeskAlertMuteStateDto>('/dispatch/alert-mute'),
      ]);
      setRows(board);
      setMute(muteState.mute);
    } catch {
      // Keep the last known board rather than blanking it on a transient error.
    }
  }

  function seed(
    board: DispatchBoardRowDto[] | null,
    muteState: DeskAlertMuteStateDto | null,
  ) {
    if (board) setRows(board);
    if (muteState) setMute(muteState.mute);
  }

  useEffect(() => seed(initialRows, initialMute), [initialRows, initialMute]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (locked) return;
    const socket = connectEscalation();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', (reason) => {
      setConnected(false);
      // The dashboard shows the lost feed ("Offline"); closing the socket on
      // leaving the desk is not a lost feed.
      if (reason !== 'io client disconnect' && onDashboardRef.current) {
        track('admin_state_shown', { kind: 'degraded' });
      }
    });
    socket.on('escalation', () => void refresh());
    return () => {
      socket.close();
    };
  }, [locked]);

  const now = new Date(nowMs);
  const flagged: FlaggedItem[] = rows.flatMap((row) =>
    row.serviceItems.map((item) => ({
      row,
      item,
      alert: itemAlert(item, now, amberThreshold),
    })),
  );
  const red = flagged.filter((entry) => entry.alert === 'RED');
  const amber = flagged.filter((entry) => entry.alert === 'AMBER');

  const alertSignature = flagged
    .map((entry) => `${entry.item.id}:${entry.alert}`)
    .join('|');

  useEffect(() => {
    const previous = lastAlerts.current;
    lastAlerts.current = new Map(flagged.map((entry) => [entry.item.id, entry.alert]));
    if (!previous) {
      return;
    }
    const crossings = alertCrossings(
      previous,
      flagged.map((entry) => ({ id: entry.item.id, alert: entry.alert })),
    );
    if (crossings.length === 0) {
      return;
    }
    amberToCue.current += crossings.filter(
      (crossing) => crossing.alert === 'AMBER',
    ).length;
    const sentences = (level: 'RED' | 'AMBER') =>
      crossings
        .filter((crossing) => crossing.alert === level)
        .map((crossing) => {
          const entry = flagged.find((candidate) => candidate.item.id === crossing.id)!;
          return announcement(entry.row, entry.item, level);
        })
        .join(' ');
    setAnnounced((last) => ({
      red: sentences('RED'),
      amber: sentences('AMBER'),
      seq: last.seq + 1,
    }));
    // `alertSignature` changes exactly when an item's alert does; the clock ticks do not.
  }, [alertSignature]);

  const isAcknowledged = (item: DispatchBoardItemDto): boolean =>
    item.acknowledgement !== null || localAcks.has(alertKey(item.id, item.offeredAt));
  const muteNow = muteWindow(mute);
  const muteActive = muteNow !== null && muteNow.until.getTime() > nowMs;
  const redAlerts = red.map(({ item }) => {
    const key = alertKey(item.id, item.offeredAt);
    return {
      key,
      raisedAt: itemRedSince(item),
      acknowledged: isAcknowledged(item),
      cued: cued.current.has(key),
    };
  });
  const cueSignature = redAlerts
    .map((alert) => `${alert.key}:${alert.acknowledged}`)
    .join('|');

  useEffect(() => {
    if (locked) return;
    const cue = alertCue({
      red: redAlerts,
      amberCrossings: amberToCue.current,
      mute: muteNow,
      lastRedCueAt: lastRedCueAt.current,
      now,
    });
    amberToCue.current = 0;
    if (!cue || !sound.play(cue) || cue !== 'RED') {
      return;
    }
    lastRedCueAt.current = now;
    for (const alert of redAlerts) {
      if (!alert.acknowledged && !muteSilences(muteNow, alert.raisedAt, now)) {
        cued.current.add(alert.key);
      }
    }
    // The clock ticks every second, so a due repeat is never late by more.
  }, [nowMs, cueSignature, mute, sound.ready, locked]);

  useEffect(
    () => () => {
      // Leaving the desk closes the undo window: the acknowledgement goes ahead.
      const pending = pendingAckRef.current;
      if (pending) {
        void recordAcknowledgement(pending, true);
      }
    },
    [],
  );

  /**
   * Acknowledge the row's unacknowledged red alerts: the cue stops here at
   * once, and the API records it for the whole desk only once the 6 s undo
   * has passed (A-States).
   */
  function acknowledge(row: DispatchBoardRowDto) {
    const items = row.serviceItems.filter(
      (item) => itemAlert(item, now, amberThreshold) === 'RED' && !isAcknowledged(item),
    );
    if (items.length === 0) {
      return;
    }
    const earlier = pendingAckRef.current;
    if (earlier) {
      void recordAcknowledgement(earlier);
    }
    ackSeq.current += 1;
    const pending: PendingAcknowledgement = {
      seq: ackSeq.current,
      bookingCode: row.bookingCode,
      items: items.map((item) => ({
        id: item.id,
        offeredAt: item.offeredAt,
        raisedAt: itemRedSince(item),
      })),
    };
    setAlertError(null);
    setPendingAck(pending);
    setLocalAcks((keys) => {
      const next = new Set(keys);
      for (const item of pending.items) next.add(alertKey(item.id, item.offeredAt));
      return next;
    });
  }

  function forget(pending: PendingAcknowledgement) {
    setLocalAcks((keys) => {
      const next = new Set(keys);
      for (const item of pending.items) next.delete(alertKey(item.id, item.offeredAt));
      return next;
    });
  }

  function undoAcknowledgement(pending: PendingAcknowledgement) {
    setPendingAck((current) => (current?.seq === pending.seq ? null : current));
    forget(pending);
  }

  async function recordAcknowledgement(pending: PendingAcknowledgement, leaving = false) {
    if (!leaving) {
      setPendingAck((current) => (current?.seq === pending.seq ? null : current));
    }
    let failure: string | null = null;
    await Promise.all(
      pending.items.map(async (item) => {
        try {
          await apiRequest<AlertAcknowledgementDto>(
            `/service-items/${item.id}/acknowledge-alert`,
            {
              method: 'POST',
              body: JSON.stringify({ offeredAt: item.offeredAt }),
              keepalive: leaving,
            },
          );
          track('alert_acknowledged', {
            service_item_id: item.id,
            seconds_to_ack: item.raisedAt
              ? Math.max(0, Math.round((Date.now() - item.raisedAt.getTime()) / 1000))
              : 0,
            channel: 'desk',
          });
        } catch (error) {
          // 409: the alert changed meanwhile (offered again, or no longer red).
          if (!(error instanceof ApiError && error.status === 409)) {
            failure = error instanceof Error ? error.message : String(error);
          }
        }
      }),
    );
    if (leaving) {
      return;
    }
    await refresh();
    forget(pending);
    if (failure) {
      setAlertError(
        t('acknowledge.failed', { code: pending.bookingCode, message: failure }),
      );
    }
  }

  async function changeMute(on: boolean) {
    setMuteBusy(true);
    setAlertError(null);
    try {
      const state = await apiRequest<DeskAlertMuteStateDto>('/dispatch/alert-mute', {
        method: on ? 'POST' : 'DELETE',
      });
      setMute(state.mute);
      if (on && state.mute) {
        track('alert_muted', { muted_for_s: ALERT_MUTE_MS / 1000, channel: 'desk' });
      }
    } catch (error) {
      setAlertError(
        t('audio.failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setMuteBusy(false);
    }
  }

  function serviceName(type: string): string {
    const column = MATRIX_COLUMNS.find((candidate) => candidate.type === type);
    return column ? t(`matrix.columns.${column.key}`) : type;
  }

  /** "Red alert. Booking VX-3PA8ZT, guide Osvaldo Ruiz timed out at 13:40. Press R…" */
  function announcement(
    row: DispatchBoardRowDto,
    item: DispatchBoardItemDto,
    level: 'RED' | 'AMBER',
  ): string {
    const values = {
      code: row.bookingCode,
      service: serviceName(item.serviceType),
      worker: item.supplierName ?? t('noWorker'),
    };
    let sentence: string;
    if (level === 'AMBER') {
      const elapsed =
        item.offeredAt && item.deadline
          ? timerElapsed(new Date(item.offeredAt), new Date(item.deadline), now)
          : 1;
      sentence = t('announce.amber', {
        ...values,
        percent: Math.min(100, Math.round(elapsed * 100)),
      });
    } else if (item.status === 'DECLINED') {
      sentence = t('announce.declined', values);
    } else {
      sentence = t('announce.timedOut', {
        ...values,
        time: item.deadline ? opsTime(item.deadline, locale) : '—',
      });
    }
    // R re-dispatches a matrix row, so only the dashboard offers it.
    const reroutable =
      onDashboardRef.current && canManage && OPEN_ITEM_STATUSES.includes(item.status);
    return reroutable && shortcutsEnabled()
      ? `${sentence} ${t('announce.pressR')}`
      : sentence;
  }

  const value: DeskAlertsValue = {
    rows,
    announced,
    now,
    connected,
    amberThreshold,
    canManage,
    red,
    amber,
    mute,
    muteActive,
    muteBusy,
    alertError,
    soundReady: sound.ready,
    unlockSound: sound.unlock,
    isAcknowledged,
    acknowledge,
    changeMute,
    refresh,
    seed,
  };

  return (
    <DeskAlertsContext.Provider value={value}>
      {children}
      {pendingAck ? (
        <UndoToast
          key={pendingAck.seq}
          message={t('acknowledge.toast', { code: pendingAck.bookingCode })}
          undoLabel={t('acknowledge.undo')}
          durationMs={ALERT_ACK_UNDO_MS}
          onUndo={() => undoAcknowledgement(pendingAck)}
          onExpire={() => void recordAcknowledgement(pendingAck)}
        />
      ) : null}
    </DeskAlertsContext.Provider>
  );
}
