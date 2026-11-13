import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import type { KeyValueStore } from './answers';

const TOKEN_KEY = 'ota.worker.session';

/** The session token, in the phone's keystore (W3). */
export const tokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

/** The answer queue and the last home, in SQLite (spec §7.2 `sync_queue`). */
export const kv: KeyValueStore = {
  get: (key) => Storage.getItemAsync(key),
  set: (key, value) => Storage.setItemAsync(key, value),
  remove: async (key) => {
    await Storage.removeItemAsync(key);
  },
};
