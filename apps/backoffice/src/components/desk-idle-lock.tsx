'use client';

import { activityReportDue, idleLockAt, ownDeviceMayBeMarked } from '@ota/domain';
import type { DeskSessionDto } from '@ota/schemas';
import { Alert, Button, Card, CardContent, CardHeader, cn } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { authClient } from '@/lib/auth-client';
import { apiRequest } from '@/lib/client-api';
import {
  DESK_LOCKED_EVENT,
  IDLE_KEYS,
  ownDeviceChosen,
  readStoredTime,
  writeStored,
} from '@/lib/idle-lock';

const LockedContext = createContext(false);

/** Whether the desk is locked: sockets close and the alert cue stops while it is. */
export function useDeskLocked(): boolean {
  return useContext(LockedContext);
}

/** How often the desk looks at the clock and the shared input time. */
const TICK_MS = 5000;
/** Pointer movement counts as input, but is recorded at most this often. */
const INPUT_THROTTLE_MS = 1000;
const INPUT_EVENTS = [
  'keydown',
  'pointerdown',
  'pointermove',
  'wheel',
  'touchstart',
] as const;

export interface DeskIdleLockProps {
  user: { id: string; name?: string | null; email: string };
  /** The session's lock facts; null when the page was rendered locked. */
  session: DeskSessionDto | null;
  /** The API refused the page's session as locked, with the limit it named. */
  lockedAfter?: number | null;
  /** True, false, or null when the page could not tell (rendered locked). */
  hasPasskey: boolean | null;
  children?: ReactNode;
}

/**
 * The desk's idle lock (`docs/schema-m9-idle-lock.md`, A-States 02). Every
 * desk tab shares the latest input time in this browser and reports it to the
 * API at most once a minute; once the limit passes with no input, or the API
 * answers `SESSION_LOCKED`, the page stays where it was but is hidden and
 * inert behind a full-screen dialog until the person unlocks it with a
 * passkey (a new sign-in in place) or signs in again.
 */
export function DeskIdleLock({
  user,
  session: initialSession,
  lockedAfter,
  hasPasskey,
  children,
}: DeskIdleLockProps) {
  const t = useTranslations('backoffice.idleLock');
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState(initialSession);
  const [locked, setLocked] = useState(lockedAfter !== undefined);
  const [minutes, setMinutes] = useState<number | null>(
    lockedAfter ?? initialSession?.idleLockMinutes ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverActive = initialSession
    ? Date.parse(initialSession.lastActiveAt ?? initialSession.signedInAt)
    : 0;
  const lastInput = useRef(serverActive);
  const lastReport = useRef<number | null>(serverActive || null);

  const name = user.name?.trim() || user.email;
  const firstName = name.split(/[\s@]+/)[0] || name;

  // The own-device choice made on the login page goes to the session once,
  // while the API still accepts it (L1).
  useEffect(() => {
    if (
      !session ||
      session.ownDevice ||
      !ownDeviceChosen() ||
      !ownDeviceMayBeMarked(new Date(session.signedInAt), new Date())
    ) {
      return;
    }
    apiRequest<DeskSessionDto>('/me/session/own-device', { method: 'POST' })
      .then((next) => {
        setSession(next);
        setMinutes(next.idleLockMinutes);
      })
      .catch(() => undefined);
  }, [session?.signedInAt]);

  // Input in any tab moves the shared clock (L3).
  useEffect(() => {
    if (locked) return;
    function onInput() {
      const now = Date.now();
      if (now - lastInput.current < INPUT_THROTTLE_MS) return;
      lastInput.current = now;
      writeStored(IDLE_KEYS.lastInput, String(now));
    }
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, onInput, { passive: true, capture: true });
    }
    return () => {
      for (const type of INPUT_EVENTS) {
        window.removeEventListener(type, onInput, { capture: true });
      }
    };
  }, [locked]);

  // Lock at the limit; otherwise report input at most once a minute.
  useEffect(() => {
    if (locked || minutes === null) return;
    const limit = minutes;
    function tick() {
      const now = Date.now();
      const shared = readStoredTime(IDLE_KEYS.lastInput);
      if (shared && shared > lastInput.current) lastInput.current = shared;
      if (now >= idleLockAt(lastInput.current, limit)) {
        setLocked(true);
        return;
      }
      const reported = Math.max(
        readStoredTime(IDLE_KEYS.lastReport) ?? 0,
        lastReport.current ?? 0,
      );
      if (
        activityReportDue({
          lastInputAt: lastInput.current,
          lastReportedAt: reported || null,
          now,
        })
      ) {
        lastReport.current = now;
        writeStored(IDLE_KEYS.lastReport, String(now));
        apiRequest('/me/activity', { method: 'POST' }).catch(() => undefined);
      }
    }
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [locked, minutes]);

  // The API's answer locks every tab, and an unlock elsewhere is checked here.
  useEffect(() => {
    function onLocked(event: Event) {
      const named = (event as CustomEvent<number | null>).detail;
      if (typeof named === 'number') setMinutes(named);
      setLocked(true);
    }
    function onStorage(event: StorageEvent) {
      if (event.key === IDLE_KEYS.unlocked && locked) void resume();
    }
    window.addEventListener(DESK_LOCKED_EVENT, onLocked);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(DESK_LOCKED_EVENT, onLocked);
      window.removeEventListener('storage', onStorage);
    };
  }, [locked]);

  // The lock is a modal dialog on the top layer; reopen it if the browser
  // closes it (a second Esc), since only an unlock may.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (locked && !dialog.open) dialog.showModal();
    if (!locked && dialog.open) dialog.close();
  }, [locked]);

  /** A valid session is back in this browser: unlock in place, or reload as its person. */
  async function resume(): Promise<boolean> {
    try {
      const next = await apiRequest<DeskSessionDto>('/me/session');
      if (next.userId !== user.id) {
        window.location.assign('/dashboard');
        return true;
      }
      const now = Date.now();
      lastInput.current = now;
      lastReport.current = null;
      writeStored(IDLE_KEYS.lastInput, String(now));
      setSession(next);
      setMinutes(next.idleLockMinutes);
      setError(null);
      setBusy(false);
      setLocked(false);
      router.refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function unlockWithPasskey() {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.passkey();
    if (!result.error && (await resume())) {
      writeStored(IDLE_KEYS.unlocked, String(Date.now()));
      return;
    }
    setBusy(false);
    setError(t('failed'));
  }

  /** Sign out of the locked session, then sign in (again, or as someone else). */
  async function signIn(returnHere: boolean) {
    setBusy(true);
    await authClient.signOut().catch(() => undefined);
    const here = `${window.location.pathname}${window.location.search}`;
    window.location.assign(
      returnHere ? `/login?next=${encodeURIComponent(here)}` : '/login',
    );
  }

  return (
    <LockedContext.Provider value={locked}>
      <div className={cn('contents', locked && 'invisible')} inert={locked}>
        {children}
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => event.preventDefault()}
        onClose={() => {
          if (locked) dialogRef.current?.showModal();
        }}
        className="m-0 h-full max-h-none w-full max-w-none border-0 bg-page p-4 text-default backdrop:bg-page"
      >
        {locked ? (
          <div className="flex min-h-full items-center justify-center">
            <Card className="w-full max-w-sm">
              <CardHeader>
                <h1 id={titleId} className="text-h4 text-default">
                  {t('title', { name })}
                </h1>
                <p className="text-body-sm text-muted">
                  {minutes === null ? t('bodyNoMinutes') : t('body', { minutes })}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {error ? <Alert variant="destructive">{error}</Alert> : null}
                {hasPasskey !== false ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy}
                    autoFocus
                    onClick={() => void unlockWithPasskey()}
                  >
                    {busy ? t('unlocking') : t('unlock')}
                  </Button>
                ) : null}
                {hasPasskey !== true ? (
                  <Button
                    type="button"
                    variant={hasPasskey === false ? 'primary' : 'secondary'}
                    className="w-full"
                    disabled={busy}
                    autoFocus={hasPasskey === false}
                    onClick={() => void signIn(true)}
                  >
                    {t('signInAgain')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="tertiary"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void signIn(false)}
                >
                  {t('notYou', { name: firstName })}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </dialog>
    </LockedContext.Provider>
  );
}
