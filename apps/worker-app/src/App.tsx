import { workerAnswerRetryDelayMs } from '@ota/domain';
import type { WorkerHomeDto, WorkerOfferDto } from '@ota/schemas';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { flushAnswers, loadAnswers, saveAnswer } from './lib/answers';
import { ApiError, createWorkerApi } from './lib/api';
import { settings } from './lib/config';
import { copy } from './lib/copy';
import { kv, tokenStore } from './lib/storage';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { OfferScreen, type OfferOutcome } from './screens/OfferScreen';
import { colors } from './ui';

const api = createWorkerApi(settings.apiUrl);

/** The last home the API sent, so the app opens with no signal (W-Home "Guardado sin conexión"). */
const HOME_KEY = 'ota.worker.home';

/** How often the countdowns move. */
const TICK_MS = 15_000;

type Screen =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'home' }
  | {
      name: 'offer';
      offer: WorkerOfferDto;
    };

/**
 * The worker app (ADR 0007, Phase 7): sign in with a code, see offers and
 * jobs, answer an offer. Answers are saved on the phone first and resent
 * until the API answers (`docs/worker-app-plan.md` W6); the last home is kept
 * for when there is no signal.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [token, setToken] = useState<string | null>(null);
  const [home, setHome] = useState<WorkerHomeDto | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, OfferOutcome>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The API's clock minus the phone's, from the last home.
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signedOut = useCallback(async (message: string | null) => {
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
        setPending(flushed.pending.length);
        if (flushed.sent.length > 0) {
          setOutcomes((previous) => {
            const next = new Map(previous);
            for (const answer of flushed.sent) {
              const known = next.get(answer.serviceItemId);
              if (known) next.set(answer.serviceItemId, { ...known, delivery: 'sent' });
            }
            return next;
          });
        }
        if (flushed.refused.length > 0) setNotice(copy.home.refused);
        if (flushed.signedOut) {
          await signedOut(copy.home.signedOut);
          return;
        }
        if (flushed.pending.length > 0) {
          retry.current = setTimeout(
            () => void sync(current),
            workerAnswerRetryDelayMs(flushed.pending[0]!.attempts),
          );
        }

        const fresh = await api.home(current);
        setHome(fresh);
        setSkew(Date.parse(fresh.serverTime) - Date.now());
        setNow(Date.now());
        setOffline(false);
        await kv.set(HOME_KEY, JSON.stringify(fresh));
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
    [signedOut],
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
      const saved = await tokenStore.get();
      if (!saved) {
        setScreen({ name: 'login' });
        return;
      }
      setToken(saved);
      const cached = await kv.get(HOME_KEY);
      if (cached) setHome(JSON.parse(cached) as WorkerHomeDto);
      setPending((await loadAnswers(kv)).length);
      setScreen({ name: 'home' });
      await sync(saved);
    })();
  }, [sync]);

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

  const serverNow = now + skew;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {screen.name === 'loading' || (screen.name !== 'login' && !home) ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : screen.name === 'login' ? (
          <LoginScreen
            api={api}
            notice={notice}
            onSignedIn={(fresh) => void signIn(fresh)}
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
            onSignOut={() => void signOut()}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
