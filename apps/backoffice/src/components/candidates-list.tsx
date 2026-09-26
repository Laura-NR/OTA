'use client';

import type { DispatchCandidateDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export function CandidatesList({ serviceItemId }: { serviceItemId: string }) {
  const t = useTranslations('backoffice.candidates');
  const [candidates, setCandidates] = useState<DispatchCandidateDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setCandidates(
        await apiRequest<DispatchCandidateDto[]>(
          `/service-items/${serviceItemId}/candidates`,
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="ghost" disabled={busy} onClick={load}>
        {busy ? t('loading') : t('show')}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {candidates ? (
        candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('supplier')}</TableHead>
                <TableHead>{t('category')}</TableHead>
                <TableHead>{t('phone')}</TableHead>
                <TableHead>{t('credentialExpires')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => (
                <TableRow key={candidate.supplierId}>
                  <TableCell className="font-medium">
                    {candidate.fullName ?? '—'}
                  </TableCell>
                  <TableCell>{candidate.category.replaceAll('_', ' ')}</TableCell>
                  <TableCell>{candidate.primaryPhone}</TableCell>
                  <TableCell>{candidate.credentialExpiresAt ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
