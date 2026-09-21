import { cookies } from 'next/headers';

import { ApiError, messageFromBody } from './errors';

/**
 * Absolute API origin used by server-side rendering and route handlers. The
 * browser never uses this: it calls the same-origin `/api/ota/*` rewrite.
 */
export function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Server-side request that forwards the browser session cookie to the API. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers ?? {}),
      cookie: cookieHeader,
    },
    cache: 'no-store',
  });

  const body = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      messageFromBody(body, response.statusText || `Request failed (${response.status})`),
      body,
    );
  }
  return body as T;
}

export interface ServerSession {
  user: {
    id: string;
    email: string;
    role?: string | null;
    name?: string | null;
  };
}

/** Resolve the Better Auth session on the server, or null when signed out. */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiBaseUrl()}/api/auth/get-session`, {
    headers: { accept: 'application/json', cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  const body = (await parseBody(response)) as ServerSession | null;
  return body?.user ? body : null;
}
