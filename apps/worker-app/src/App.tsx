import {
  emergencySms,
  installedWorkerApp,
  needsBackgroundResend,
  workerAnswerRetryDelayMs,
  workerAppApkFor,
  workerAppSnoozedUntil,
  workerAppUpdate,
  workerJobActive,
  workerJsUpdateCheckDue,
  type EmergencyCategory,
  type EmergencyPosition,
  type JobAction,
  type JobStep,
  type WorkerMessageDraft,
} from '@ota/domain';
import type {
  WorkerAppLatestDto,
  WorkerHomeDto,
  WorkerJobDto,
  WorkerOfferDto,
} from '@ota/schemas';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  flushAnswers,
  loadAnswers,
  loadJobActions,
  loadMessages,
  newClientRef,
  saveAnswer,
  saveJobAction,
  saveMessage,
  takeBackgroundReport,
  waiting,
} from './lib/answers';
import { ApiError, createWorkerApi } from './lib/api';
import { installedVersionCode } from './lib/app-version';
import { setBackgroundResend } from './lib/background';
import { settings } from './lib/config';
import { copy } from './lib/copy';
import { fetchJsUpdate } from './lib/js-update';
import { askForPosition, emergencyPosition } from './lib/position';
import { kv, tokenStore } from './lib/storage';
import { CalendarScreen } from './screens/CalendarScreen';
import { CredentialsScreen } from './screens/CredentialsScreen';
import { EarningsScreen } from './screens/EarningsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { JobScreen, type EmergencyOutcome } from './screens/JobScreen';
import { JobsScreen } from './screens/JobsScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { OfferScreen, type OfferOutcome } from './screens/OfferScreen';
import { UpdateScreen } from './screens/UpdateScreen';
import { TabBar, colors, type Tab } from './ui';

const api = createWorkerApi(settings.apiUrl);

/** The last home the API sent, so the app opens with no signal (W-Home "Guardado sin conexión"). */
const HOME_KEY = 'ota.worker.home';

/** How often the countdowns move. */
const TICK_MS = 15_000;

/** When "Más tarde" hides an optional update until, and the last JS update check (U3a, U5a). */
const UPDATE_SNOOZE_KEY = 'ota.worker.updateSnoozedUntil';
const JS_CHECK_KEY = 'ota.worker.jsUpdateCheckedAt';

/** The release and split this APK is (U8). */
const installed = installedWorkerApp(installedVersionCode());

/** Whether a job is under way, from the home and the steps still on the phone (U3a). */
function jobUnderWay(
  jobs: readonly WorkerJobDto[],
  queued: readonly JobAction[],
  now: Date,
): boolean {
  const date = (value: string | null) => (value ? new Date(value) : null);
  return (
    queued.some((action) => action.kind === 'step' && action.step !== 'FINISHED') ||
    workerJobActive(
      jobs.map((job) => ({
        startsAt: new Date(job.startsAt),
        endsAt: new Date(job.endsAt),
        steps: job.steps
          ? {
              EN_ROUTE: date(job.steps.EN_ROUTE),
              ARRIVED: date(job.steps.ARRIVED),
              STARTED: date(job.steps.STARTED),
              FINISHED: date(job.steps.FINISHED),
            }
          : null,
      })),
      now,
    )
  );
}

/**
 * The background resend comes on top of the resend while the app is open, so
 * a phone that refuses to schedule it loses only that: the refusal is logged.
 */
function keepResendingInBackground(on: boolean) {
  setBackgroundResend(on).catch((error: unknown) =>
    console.warn('Background resend not scheduled', error),
  );
}

type Screen =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'home' }
  | { name: 'calendar' }
  | { name: 'earnings' }
  | { name: 'credentials' }
  | { name: 'jobs' }
  | { name: 'update' }
  | { name: 'job'; serviceItemId: string }
  /** The thread with the desk; from a job, about it (`docs/schema-w-messages.md`). */
  | { name: 'messages'; serviceItemId: string | null }
  | {
      name: 'offer';
      offer: WorkerOfferDto;
    };

/** Where each section of the bottom bar opens; "Perfil" is reliability and payouts. */
const TAB_SCREEN: Record<Tab, Screen> = {
  home: { name: 'home' },
  calendar: { name: 'calendar' },
  jobs: { name: 'jobs' },
  profile: { name: 'earnings' },
};

/** Which section of the bottom bar a screen belongs to; null where the bar is hidden. */
const SCREEN_TAB: Partial<Record<Screen['name'], Tab>> = {
  home: 'home',
  calendar: 'calendar',
  jobs: 'jobs',
  earnings: 'profile',
};

/**
 * The worker app (ADR 0007, Phase 7): sign in with a code, see offers and
 * jobs, answer an offer, block days in the calendar, read their reliability
 * and payouts, keep their documents up to date, and update the app outside the
 * stores, and write to the desk. Answers and messages are saved on the phone first and resent
 * until the API answers (`docs/worker-app-plan.md` W6), in the background too
 * (spec §7.2); the last home is kept for when there is no signal.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [token, setToken] = useState<string | null>(null);
  const [home, setHome] = useState<WorkerHomeDto | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  // W-Job's steps and reports still on the phone, shown on the job.
  const [jobActions, setJobActions] = useState<JobAction[]>([]);
  // Messages to the desk still on the phone, and those sent since the last home.
  const [messageDrafts, setMessageDrafts] = useState<WorkerMessageDraft[]>([]);
  const [delivered, setDelivered] = useState<WorkerMessageDraft[]>([]);
  // The last report's position, for the SMS (J6).
  const lastPosition = useRef<EmergencyPosition | null>(null);
  const positionAsked = useRef(false);
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, OfferOutcome>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The API's clock minus the phone's, from the last home.
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The published APK (U3a) and when "Más tarde" stops hiding it.
  const [latest, setLatest] = useState<WorkerAppLatestDto | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<Date | null>(null);

  /**
   * Reads the published APK and, once a day with no job under way, fetches a
   * signed JS update for the next start (U3a, U5a). Neither is needed to
   * work: with no signal they wait for the next sync.
   */
  const checkForUpdates = useCallback(async (jobActive: boolean) => {
    try {
      setLatest(await api.latestRelease());
    } catch {
      // No signal or no answer: the prompt keeps what it last knew.
    }
    const checkedAt = await kv.get(JS_CHECK_KEY);
    if (
      !workerJsUpdateCheckDue(
        checkedAt ? new Date(checkedAt) : null,
        jobActive,
        new Date(),
      )
    ) {
      return;
    }
    try {
      await fetchJsUpdate();
      await kv.set(JS_CHECK_KEY, new Date().toISOString());
    } catch (error) {
      console.warn('JS update not checked', error);
    }
  }, []);

  const signedOut = useCallback(async (message: string | null) => {
    keepResendingInBackground(false);
    await tokenStore.clear();
    setToken(null);
    setHome(null);
    setNotice(message);
    setScreen({ name: 'login' });
  }, []);

  const runSync = useCallback(
    async (current: string) => {
      if (retry.current) clearTimeout(retry.current);
      setRefreshing(true);
      try {
        const flushed = await flushAnswers(kv, api, current);
        // What the background resend did while the worker was away.
        const away = await takeBackgroundReport(kv);
        const sent = [
          ...away.sent,
          ...flushed.sent.map((answer) => answer.serviceItemId),
        ];
        const left = waiting(flushed);
        setPending(left.length);
        setJobActions(flushed.jobs.pending);
        setMessageDrafts(flushed.messages.pending);
        if (flushed.messages.sent.length > 0) {
          setDelivered((previous) => [...previous, ...flushed.messages.sent]);
        }
        keepResendingInBackground(needsBackgroundResend(left.length, !flushed.signedOut));
        if (sent.length > 0) {
          setOutcomes((previous) => {
            const next = new Map(previous);
            for (const serviceItemId of sent) {
              const known = next.get(serviceItemId);
              if (known) next.set(serviceItemId, { ...known, delivery: 'sent' });
            }
            return next;
          });
        }
        if (flushed.refused.length > 0 || away.refused > 0) setNotice(copy.home.refused);
        if (flushed.jobs.refused.length > 0 || away.jobsRefused > 0) {
          setNotice(copy.job.stepRefused);
        }
        if (flushed.messages.refused.length > 0 || away.messagesRefused > 0) {
          setNotice(copy.messages.refused);
        }
        if (flushed.signedOut) {
          await signedOut(copy.home.signedOut);
          return;
        }
        if (left.length > 0) {
          retry.current = setTimeout(
            () => void sync(current),
            workerAnswerRetryDelayMs(Math.max(...left.map((item) => item.attempts))),
          );
        }

        const fresh = await api.home(current);
        setHome(fresh);
        // Sent messages the home now holds need no copy of their own.
        const held = new Set(
          fresh.messages?.messages.map((message) => message.clientRef),
        );
        setDelivered((previous) =>
          previous.filter((draft) => !held.has(draft.clientRef)),
        );
        setSkew(Date.parse(fresh.serverTime) - Date.now());
        setNow(Date.now());
        setOffline(false);
        await kv.set(HOME_KEY, JSON.stringify(fresh));
        void checkForUpdates(jobUnderWay(fresh.jobs, flushed.jobs.pending, new Date()));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await signedOut(copy.home.signedOut);
        } else if (error instanceof ApiError && error.status !== null) {
          setNotice(error.message);
        } else {
          setOffline(true);
        }
      } finally {
        setRefreshing(false);
      }
    },
    [signedOut, checkForUpdates],
  );

  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  /**
   * One sync at a time: two at once could send the same saved answer twice,
   * and the API's refusal of the second would read as the offer having gone.
   * A sync asked for meanwhile runs once the current one ends.
   */
  const sync = useCallback(
    async (current: string) => {
      if (inFlight.current) {
        again.current = true;
        await inFlight.current;
        return;
      }
      do {
        again.current = false;
        inFlight.current = runSync(current);
        await inFlight.current;
        inFlight.current = null;
      } while (again.current);
    },
    [runSync],
  );

  useEffect(() => {
    void (async () => {
      const snoozed = await kv.get(UPDATE_SNOOZE_KEY);
      if (snoozed) setSnoozedUntil(new Date(snoozed));
      const saved = await tokenStore.get();
      if (!saved) {
        setScreen({ name: 'login' });
        await checkForUpdates(false);
        return;
      }
      setToken(saved);
      const cached = await kv.get(HOME_KEY);
      if (cached) setHome(JSON.parse(cached) as WorkerHomeDto);
      const actions = await loadJobActions(kv);
      setJobActions(actions);
      const drafts = await loadMessages(kv);
      setMessageDrafts(drafts);
      setPending((await loadAnswers(kv)).length + actions.length + drafts.length);
      setScreen({ name: 'home' });
      await sync(saved);
    })();
  }, [sync, checkForUpdates]);

  useEffect(() => {
    if (!token) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync(token);
    });
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      subscription.remove();
      clearInterval(tick);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [token, sync]);

  async function signIn(fresh: string) {
    await tokenStore.set(fresh);
    setToken(fresh);
    setNotice(null);
    setScreen({ name: 'home' });
    await sync(fresh);
  }

  async function signOut() {
    if (token) await api.signOut(token).catch(() => undefined);
    await kv.remove(HOME_KEY);
    await signedOut(null);
  }

  async function answer(
    offer: WorkerOfferDto,
    kind: 'accept' | 'decline',
    reason?: string,
  ) {
    if (!token) return;
    const answeredAt = new Date(Date.now() + skew).toISOString();
    await saveAnswer(kv, {
      serviceItemId: offer.serviceItemId,
      kind,
      reason,
      answeredAt,
    });
    setOutcomes((previous) =>
      new Map(previous).set(offer.serviceItemId, {
        kind,
        reason,
        answeredAt,
        delivery: 'queued',
      }),
    );
    await sync(token);
  }

  /** W-Job: a step saved with its time, then sent (J2). */
  async function recordStep(job: WorkerJobDto, step: JobStep) {
    if (!token) return;
    const actions = await saveJobAction(kv, {
      kind: 'step',
      serviceItemId: job.serviceItemId,
      step,
      occurredAt: new Date(Date.now() + skew).toISOString(),
    });
    setJobActions(actions);
    await sync(token);
  }

  function openSms(job: WorkerJobDto, outcome: EmergencyOutcome) {
    if (!settings.deskPhone) return;
    const text = emergencySms({
      bookingCode: job.bookingCode,
      category: outcome.category,
      position: lastPosition.current,
      at: new Date(outcome.at),
      workerFirstName: home?.worker.firstName ?? null,
    });
    void Linking.openURL(
      `sms:${settings.deskPhone.replace(/\s/g, '')}?body=${encodeURIComponent(text)}`,
    );
  }

  /**
   * W-Job's emergency (J5–J7): the position, the report saved and sent; when
   * it did not reach the API, the SMS composer opens with the same facts.
   */
  async function reportEmergency(
    job: WorkerJobDto,
    category: EmergencyCategory,
  ): Promise<EmergencyOutcome> {
    const at = new Date(Date.now() + skew).toISOString();
    const position = await emergencyPosition();
    lastPosition.current = position;
    const clientRef = newClientRef();
    setJobActions(
      await saveJobAction(kv, {
        kind: 'emergency',
        serviceItemId: job.serviceItemId,
        clientRef,
        category,
        occurredAt: at,
        position,
      }),
    );
    if (token) await sync(token);
    const stillQueued = (await loadJobActions(kv)).some(
      (action) => action.kind === 'emergency' && action.clientRef === clientRef,
    );
    const outcome = { category, at, delivered: !stillQueued };
    if (stillQueued) openSms(job, outcome);
    return outcome;
  }

  /** A message to the desk, saved with its time and an id, then sent (M4). */
  async function sendMessage(body: string, serviceItemId: string | null) {
    if (!token) return;
    setMessageDrafts(
      await saveMessage(kv, {
        clientRef: newClientRef(),
        body,
        serviceItemId,
        writtenAt: new Date(Date.now() + skew).toISOString(),
      }),
    );
    await sync(token);
  }

  /** Opening the thread reads the desk's messages (M3); it waits for a signal if there is none. */
  function openMessages(serviceItemId: string | null) {
    setScreen({ name: 'messages', serviceItemId });
    if (token && (home?.messages?.unread ?? 0) > 0) {
      api
        .markMessagesRead(token)
        .then(() =>
          setHome((current) =>
            current?.messages
              ? { ...current, messages: { ...current.messages, unread: 0 } }
              : current,
          ),
        )
        .catch(() => undefined);
    }
  }

  function openJob(job: WorkerJobDto) {
    if (!positionAsked.current) {
      positionAsked.current = true;
      askForPosition().catch((error: unknown) =>
        console.warn('Position permission not asked', error),
      );
    }
    setScreen({ name: 'job', serviceItemId: job.serviceItemId });
  }

  function selectTab(tab: Tab) {
    setScreen(TAB_SCREEN[tab]);
  }

  async function snoozeUpdate() {
    const until = workerAppSnoozedUntil(new Date());
    setSnoozedUntil(until);
    await kv.set(UPDATE_SNOOZE_KEY, until.toISOString());
    setScreen({ name: 'home' });
  }

  const serverNow = now + skew;
  const openedJob =
    screen.name === 'job' || screen.name === 'messages'
      ? (home?.jobs.find((job) => job.serviceItemId === screen.serviceItemId) ?? null)
      : null;
  const release = latest?.release ?? null;
  const update = workerAppUpdate({
    installedVersionCode: installed.versionCode,
    release,
    jobActive: jobUnderWay(home?.jobs ?? [], jobActions, new Date(serverNow)),
    snoozedUntil,
    now: new Date(serverNow),
  });
  const updateApk = release ? workerAppApkFor(release.apks, installed.abi) : null;
  // A required update stands in front of everything, offers included (U3a).
  const updateScreen =
    release && updateApk && latest && (update === 'required' || screen.name === 'update')
      ? { release, apk: updateApk, downloadUrl: latest.downloadUrl }
      : null;
  const tab = token && update !== 'required' ? (SCREEN_TAB[screen.name] ?? null) : null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {screen.name === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : updateScreen ? (
          <UpdateScreen
            release={updateScreen.release}
            apk={updateScreen.apk}
            apkUrl={api.apkUrl(updateScreen.apk.path)}
            downloadUrl={updateScreen.downloadUrl}
            required={update === 'required'}
            onLater={() => void snoozeUpdate()}
          />
        ) : screen.name !== 'login' && !home ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : screen.name === 'login' ? (
          <LoginScreen
            api={api}
            notice={notice}
            onSignedIn={(fresh) => void signIn(fresh)}
          />
        ) : screen.name === 'calendar' && token ? (
          <CalendarScreen
            api={api}
            token={token}
            onOpenOffer={(offer) => setScreen({ name: 'offer', offer })}
            onBack={() => setScreen({ name: 'home' })}
            onSignedOut={() => void signedOut(copy.home.signedOut)}
          />
        ) : screen.name === 'earnings' && token ? (
          <EarningsScreen
            api={api}
            token={token}
            onOpenCredentials={() => setScreen({ name: 'credentials' })}
            onBack={() => setScreen({ name: 'home' })}
            onSignedOut={() => void signedOut(copy.home.signedOut)}
          />
        ) : screen.name === 'credentials' && token ? (
          <CredentialsScreen
            api={api}
            token={token}
            now={serverNow}
            onBack={() => setScreen({ name: 'home' })}
            onSignedOut={() => void signedOut(copy.home.signedOut)}
          />
        ) : screen.name === 'jobs' && home ? (
          <JobsScreen jobs={home.jobs} onOpenJob={openJob} />
        ) : screen.name === 'job' && openedJob && home ? (
          <JobScreen
            job={openedJob}
            now={serverNow}
            offline={offline}
            savedAt={home.serverTime}
            queued={jobActions.filter(
              (action) => action.serviceItemId === openedJob.serviceItemId,
            )}
            onStep={(step) => recordStep(openedJob, step)}
            onEmergency={(category) => reportEmergency(openedJob, category)}
            onSms={(outcome) => openSms(openedJob, outcome)}
            onMessage={() => openMessages(openedJob.serviceItemId)}
            onBack={() => setScreen({ name: 'jobs' })}
          />
        ) : screen.name === 'messages' && home ? (
          <MessagesScreen
            messages={home.messages?.messages ?? []}
            delivered={delivered}
            queued={messageDrafts}
            jobCode={openedJob?.bookingCode ?? null}
            offline={offline}
            onSend={(body) => sendMessage(body, openedJob?.serviceItemId ?? null)}
            onBack={() =>
              setScreen(
                openedJob
                  ? { name: 'job', serviceItemId: openedJob.serviceItemId }
                  : { name: 'home' },
              )
            }
          />
        ) : screen.name === 'offer' ? (
          <OfferScreen
            offer={screen.offer}
            now={serverNow}
            outcome={outcomes.get(screen.offer.serviceItemId) ?? null}
            onAnswer={(kind, reason) => answer(screen.offer, kind, reason)}
            onBack={() => setScreen({ name: 'home' })}
          />
        ) : (
          <HomeScreen
            home={home!}
            now={serverNow}
            offline={offline}
            pending={pending}
            answered={new Set(outcomes.keys())}
            notice={notice}
            refreshing={refreshing}
            onRefresh={() => token && void sync(token)}
            onOpenOffer={(offer) => setScreen({ name: 'offer', offer })}
            onOpenJob={openJob}
            onOpenCredentials={() => setScreen({ name: 'credentials' })}
            onOpenMessages={() => openMessages(null)}
            onSignOut={() => void signOut()}
            update={
              update === 'optional' || update === 'after-job'
                ? { kind: update, versionName: release!.versionName }
                : null
            }
            onOpenUpdate={() => setScreen({ name: 'update' })}
          />
        )}
        {tab ? (
          <TabBar
            current={tab}
            labels={{
              home: copy.nav.home,
              calendar: copy.nav.calendar,
              jobs: copy.nav.jobs,
              profile: copy.nav.profile,
            }}
            label={copy.nav.label}
            onSelect={selectTab}
          />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
