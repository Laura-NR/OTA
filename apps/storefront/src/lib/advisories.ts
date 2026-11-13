import {
  OPS_TIME_ZONE,
  advisoryCoversProvinces,
  compareAdvisories,
  cubaProvinceCode,
} from '@ota/domain';
import type { AdvisoryAcknowledgementsDto, PublicAdvisoryDto } from '@ota/schemas';

import { apiBaseUrl, apiFetch } from './api';
import { plainSpaces } from './format';

async function publicFetch(path: string): Promise<PublicAdvisoryDto[]> {
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    return response.ok ? ((await response.json()) as PublicAdvisoryDto[]) : [];
  } catch {
    // The banner and notices are never worth failing a page for.
    return [];
  }
}

/** The advisories in force, in the visitor's language, most severe first (M7). */
export async function getActiveAdvisories(locale: string): Promise<PublicAdvisoryDto[]> {
  return publicFetch(`/advisories/active?locale=${encodeURIComponent(locale)}`);
}

/** Ended advisories for the Current Conditions history. */
export async function getAdvisoryHistory(locale: string): Promise<PublicAdvisoryDto[]> {
  return publicFetch(`/advisories/history?locale=${encodeURIComponent(locale)}`);
}

/** The signed-in visitor's acknowledged critical advisories; none when signed out. */
export async function getAcknowledgedAdvisories(): Promise<string[]> {
  return apiFetch<AdvisoryAcknowledgementsDto>('/me/advisories/acknowledgements')
    .then((body) => body.advisoryIds)
    .catch(() => []);
}

/**
 * The active advisories a trip's provinces fall under (package pages and the
 * booking form's first step), given as the names catalogue items carry.
 */
export function advisoriesForProvinces(
  advisories: readonly PublicAdvisoryDto[],
  provinceNames: readonly string[],
): PublicAdvisoryDto[] {
  const codes = provinceNames.flatMap((name) => cubaProvinceCode(name) ?? []);
  return advisories
    .filter((advisory) => advisory.showOnPackages)
    .filter((advisory) => advisoryCoversProvinces(advisory.regions, codes))
    .sort((a, b) =>
      compareAdvisories(
        { severity: a.severity, effectiveFrom: new Date(a.effectiveFrom) },
        { severity: b.severity, effectiveFrom: new Date(b.effectiveFrom) },
      ),
    );
}

/** A date in Cuba ("6 Oct 2026"), as the desk set it. */
export function advisoryDay(value: string, locale: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      timeZone: OPS_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value)),
  );
}
