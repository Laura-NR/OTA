import { WORKER_BACKGROUND_RESEND_MINUTES } from '@ota/domain';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { resendInBackground } from './answers';
import { createWorkerApi } from './api';
import { settings } from './config';
import { kv, tokenStore } from './storage';

const RESEND_TASK = 'ota.worker.resend';

/**
 * Spec §7.2: the saved answers are resent with the app closed. Android runs
 * the task through WorkManager once the phone has a connection, no sooner than
 * WORKER_BACKGROUND_RESEND_MINUTES after the app left the screen. It is defined
 * when the bundle loads (`index.ts` imports this first), because Android may
 * start the app with no screen just to run it.
 */
TaskManager.defineTask(RESEND_TASK, async () => {
  try {
    await resendInBackground(
      kv,
      createWorkerApi(settings.apiUrl),
      await tokenStore.get(),
    );
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** The last schedule or cancel asked for, so they apply in the order asked. */
let scheduling: Promise<unknown> = Promise.resolve();

/**
 * Schedules the background resend or cancels it (`needsBackgroundResend`). A
 * phone that restricts background work keeps the resend on open, on return to
 * the foreground and by timer while open. Calls run one after another: a
 * sign-out's cancel must not read "not scheduled yet" while a sync's schedule
 * is still on its way.
 */
export function setBackgroundResend(on: boolean): Promise<void> {
  const run = scheduling.then(() => applyBackgroundResend(on));
  scheduling = run.catch(() => undefined);
  return run;
}

async function applyBackgroundResend(on: boolean): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(RESEND_TASK);
  if (on && !registered) {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    await BackgroundTask.registerTaskAsync(RESEND_TASK, {
      minimumInterval: WORKER_BACKGROUND_RESEND_MINUTES,
    });
  } else if (!on && registered) {
    await BackgroundTask.unregisterTaskAsync(RESEND_TASK);
  }
}
