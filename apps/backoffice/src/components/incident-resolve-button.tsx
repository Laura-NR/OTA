'use client';

import { Button } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Close an open duty-of-care incident (spec §4.9.4). */
export function IncidentResolveButton({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/incidents/${incidentId}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      router.refresh();
    } catch (resolveError) {
      setError(
        resolveError instanceof Error ? resolveError.message : 'Could not resolve',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button size="sm" variant="outline" disabled={busy} onClick={resolve}>
        {busy ? 'Resolving…' : 'Resolve'}
      </Button>
    </div>
  );
}
