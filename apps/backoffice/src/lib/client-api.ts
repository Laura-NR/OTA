import { ApiError, messageFromBody } from './errors';

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
    throw new ApiError(
      response.status,
      messageFromBody(body, response.statusText || `Request failed (${response.status})`),
      body,
    );
  }
  return body as T;
}
