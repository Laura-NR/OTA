import { cookies } from 'next/headers';

/**
 * Absolute API origin used by server-side rendering. The browser never uses
 * this: it calls the same-origin `/api/ota/*` rewrite.
 */
export function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

export interface StorefrontSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
  };
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

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** Resolve the Better Auth session on the server, or null when signed out. */
export async function getServerSession(): Promise<StorefrontSession | null> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiBaseUrl()}/api/auth/get-session`, {
    headers: { accept: 'application/json', cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as StorefrontSession | null;
  return body?.user ? body : null;
}
