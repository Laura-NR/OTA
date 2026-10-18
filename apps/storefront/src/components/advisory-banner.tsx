'use client';

import type { AdvisorySeverity } from '@ota/domain';
import { CrisisBanner, type CrisisSeverity } from '@ota/ui';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import { DISMISSED_ADVISORIES_COOKIE, parseDismissed } from '@/lib/advisory-cookie';

const TONE: Record<AdvisorySeverity, CrisisSeverity> = {
  INFO: 'info',
  CAUTION: 'warning',
  CRITICAL: 'critical',
};

/** Half a year: longer than any advisory's window is expected to run. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export interface BannerAdvisory {
  id: string;
  severity: AdvisorySeverity;
  headline: string;
  body: string;
  cta: string | null;
}

function remember(id: string) {
  const cookie = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${DISMISSED_ADVISORIES_COOKIE}=`));
  const ids = new Set(parseDismissed(cookie?.split('=')[1]));
  ids.add(id);
  document.cookie = `${DISMISSED_ADVISORIES_COOKIE}=${[...ids].join(',')}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * The site banner from the active advisories (DS 03 crisis banner, M7): every
 * critical one, which a signed-in traveler acknowledges (recorded) and an
 * anonymous visitor collapses for this visit; then the most severe info or
 * caution the visitor has not dismissed. The server already left dismissed
 * ones out (the cookie), so nothing flashes back.
 */
export function AdvisoryBanner({
  advisories,
  acknowledged,
  signedIn,
  labels,
}: {
  advisories: readonly BannerAdvisory[];
  acknowledged: readonly string[];
  signedIn: boolean;
  labels: {
    label: string;
    dismiss: string;
    acknowledge: string;
    reopen: string;
    details: string;
  };
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const critical = advisories.filter((advisory) => advisory.severity === 'CRITICAL');
  const other = advisories.find(
    (advisory) => advisory.severity !== 'CRITICAL' && !dismissed.includes(advisory.id),
  );
  const shown = [...critical, ...(other ? [other] : [])];

  return (
    <>
      {shown.map((advisory) => (
        <CrisisBanner
          key={advisory.id}
          severity={TONE[advisory.severity]}
          label={labels.label}
          title={advisory.headline}
          className="static"
          action={
            <Link
              href="/travel-info#advisories"
              className="whitespace-nowrap font-semibold underline underline-offset-[3px]"
            >
              {advisory.cta ?? labels.details}
            </Link>
          }
          acknowledgeLabel={labels.acknowledge}
          reopenLabel={labels.reopen}
          defaultAcknowledged={acknowledged.includes(advisory.id)}
          onAcknowledge={
            signedIn
              ? () => {
                  void fetch(`/api/ota/me/advisories/${advisory.id}/acknowledge`, {
                    method: 'POST',
                  });
                }
              : undefined
          }
          dismissLabel={labels.dismiss}
          onDismiss={() => {
            remember(advisory.id);
            setDismissed((current) => [...current, advisory.id]);
          }}
        >
          {advisory.body}
        </CrisisBanner>
      ))}
    </>
  );
}
