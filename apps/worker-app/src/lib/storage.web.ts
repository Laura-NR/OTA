import type { KeyValueStore } from './answers';

const TOKEN_KEY = 'ota.worker.session';

/**
 * The web preview (screenshots and e2e only, never shipped to workers) keeps
 * everything in the browser's localStorage.
 */
export const tokenStore = {
  get: async () => window.localStorage.getItem(TOKEN_KEY),
  set: async (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: async () => window.localStorage.removeItem(TOKEN_KEY),
};

export const kv: KeyValueStore = {
  get: async (key) => window.localStorage.getItem(key),
  set: async (key, value) => window.localStorage.setItem(key, value),
  remove: async (key) => window.localStorage.removeItem(key),
};
