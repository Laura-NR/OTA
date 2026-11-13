import type { BetterAuthOptions } from 'better-auth';

export interface SiteBaseURLInput {
  /** `BETTER_AUTH_URL`: the only base without `allowedHosts`, the fallback with them. */
  baseURL: string;
  /** The public hosts that keep their own sessions (`AUTH_ALLOWED_HOSTS`). */
  allowedHosts?: string[];
}

export interface SiteBaseURL {
  baseURL: NonNullable<BetterAuthOptions['baseURL']>;
  /** Read the host from `X-Forwarded-Host`, which the Next rewrites set. */
  trustedProxyHeaders: boolean;
}

/**
 * Where Better Auth builds its links and sets its cookies (deployment plan
 * D7(a), B6). Without allowed hosts everything lives on `baseURL`, as in dev.
 * With them, each request is answered on the host the browser used, read
 * from `X-Forwarded-Host` (a Next rewrite replaces any value the client sent
 * with the incoming `Host`), so a link asked for on the desk opens on the desk
 * and its session cookie never reaches the storefront. A host outside the
 * list gets `baseURL`. The scheme is `baseURL`'s, because behind the proxy
 * the API itself is reached over plain http.
 */
export function siteBaseURL(input: SiteBaseURLInput): SiteBaseURL {
  const allowedHosts = (input.allowedHosts ?? [])
    .map((host) => host.trim())
    .filter(Boolean);
  if (allowedHosts.length === 0) {
    return { baseURL: input.baseURL, trustedProxyHeaders: false };
  }
  const protocol = new URL(input.baseURL).protocol === 'https:' ? 'https' : 'http';
  return {
    baseURL: { allowedHosts, protocol, fallback: input.baseURL },
    trustedProxyHeaders: true,
  };
}
