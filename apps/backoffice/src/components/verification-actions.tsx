'use client';

import type { VerificationStatus } from '@ota/domain';
import { Alert, Button } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export const VERIFICATION_ACTIONS: Record<
  VerificationStatus,
  { label: string; to: VerificationStatus }[]
> = {
  PENDING_AUDIT: [
    { label: 'Verify', to: 'VERIFIED' },
    { label: 'Reject', to: 'REJECTED' },
  ],
  VERIFIED: [{ label: 'Suspend', to: 'SUSPENDED' }],
  REJECTED: [{ label: 'Re-audit', to: 'PENDING_AUDIT' }],
  SUSPENDED: [{ label: 'Reinstate', to: 'VERIFIED' }],
};

export interface VerificationActionsProps {
  supplierId: string;
  status: VerificationStatus;
  canVerify: boolean;
}

export function VerificationActions({
  supplierId,
  status,
  canVerify,
}: VerificationActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canVerify) {
    return null;
  }

  async function setVerification(to: VerificationStatus) {
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/verification`, {
        method: 'POST',
        body: JSON.stringify({ status: to }),
      });
      router.refresh();
    } catch (verificationError) {
      setError(
        verificationError instanceof Error ? verificationError.message : 'Update failed',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {VERIFICATION_ACTIONS[status].map((action) => (
          <Button
            key={action.to}
            size="sm"
            variant={action.to === 'REJECTED' ? 'destructive' : 'outline'}
            disabled={pending}
            onClick={() => setVerification(action.to)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
