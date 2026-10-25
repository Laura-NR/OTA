import { ApiError, messageFromBody } from './errors';

/**
 * Dispatched on `window` when the API refuses an action for the operator's
 * role (403), so the desk's T-Events shell can report the denied state.
 */
export const DESK_DENIED_EVENT = 'ota:desk-denied';

/** Same-origin URL used by client components for OTA API calls. */
export function browserApiUrl(path: string): string {
  return `/api/ota${path}`;
}

/**
 * Browser request through the same-origin rewrite. Defaults the JSON
 * content-type when a body is present; callers may override headers.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(browserApiUrl(path), {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    if (response.status === 403) {
      window.dispatchEvent(new Event(DESK_DENIED_EVENT));
    }
    throw new ApiError(
      response.status,
      messageFromBody(body, response.statusText || `Request failed (${response.status})`),
      body,
    );
  }
  return body as T;
}
