'use client';

import type { VerificationStatus } from '@ota/domain';
import type { SupplierDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

const ACTIONS: Record<VerificationStatus, { label: string; to: VerificationStatus }[]> = {
  PENDING_AUDIT: [
    { label: 'Verify', to: 'VERIFIED' },
    { label: 'Reject', to: 'REJECTED' },
  ],
  VERIFIED: [{ label: 'Suspend', to: 'SUSPENDED' }],
  REJECTED: [{ label: 'Re-audit', to: 'PENDING_AUDIT' }],
  SUSPENDED: [{ label: 'Reinstate', to: 'VERIFIED' }],
};

function statusVariant(status: VerificationStatus) {
  if (status === 'VERIFIED') return 'success' as const;
  if (status === 'REJECTED' || status === 'SUSPENDED') return 'destructive' as const;
  return 'secondary' as const;
}

export function SuppliersTable({
  suppliers,
  canVerify,
}: {
  suppliers: SupplierDto[];
  canVerify: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setVerification(id: string, status: VerificationStatus) {
    setPendingId(id);
    setError(null);
    try {
      await apiRequest(`/suppliers/${id}/verification`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } catch (verificationError) {
      setError(
        verificationError instanceof Error ? verificationError.message : 'Update failed',
      );
    } finally {
      setPendingId(null);
    }
  }

  if (suppliers.length === 0) {
    return (
      <Alert>No suppliers yet. Recruitment intake is not built in this increment.</Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Provinces</TableHead>
            <TableHead>RTN licence</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Available</TableHead>
            {canVerify ? <TableHead>Verification</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((supplier) => (
            <TableRow key={supplier.id}>
              <TableCell>
                <div className="font-medium">{supplier.fullName ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{supplier.email}</div>
              </TableCell>
              <TableCell>{supplier.category.replaceAll('_', ' ')}</TableCell>
              <TableCell>{supplier.provincesActive.join(', ') || '—'}</TableCell>
              <TableCell>{supplier.rtnLicenseNumber}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(supplier.verificationStatus)}>
                  {supplier.verificationStatus.replaceAll('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell>{supplier.isAvailable ? 'Yes' : 'No'}</TableCell>
              {canVerify ? (
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS[supplier.verificationStatus].map((action) => (
                      <Button
                        key={action.to}
                        size="sm"
                        variant={action.to === 'REJECTED' ? 'destructive' : 'outline'}
                        disabled={pendingId === supplier.id}
                        onClick={() => setVerification(supplier.id, action.to)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
