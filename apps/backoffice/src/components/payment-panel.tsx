'use client';

import type { PaymentIntentDto, PaymentReceiptDto } from '@ota/schemas';
import { Alert, Badge, Button, Label, Select } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

const RAILS = [
  { value: 'CARD', label: 'Credit / debit card' },
  { value: 'OPEN_BANKING_SEPA', label: 'SEPA / open banking' },
] as const;

type Rail = (typeof RAILS)[number]['value'];

const PAYABLE_STATUSES = ['SECURED_AND_INVOICED', 'PENDING_PAYMENT'];

/**
 * Payment links and confirmation (spec §7.1). The link is generated once the
 * booking is secured; confirming simulates the gateway callback until a real
 * provider with signed webhooks is wired (ADR 0003).
 */
export function PaymentPanel({
  reservationId,
  status,
  canManage,
  receipts,
}: {
  reservationId: string;
  status: string;
  canManage: boolean;
  receipts: PaymentReceiptDto[];
}) {
  const router = useRouter();
  const [rail, setRail] = useState<Rail>('CARD');
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = canManage && PAYABLE_STATUSES.includes(status);

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      const intent = await apiRequest<PaymentIntentDto>(
        `/reservations/${reservationId}/payments`,
        { method: 'POST', body: JSON.stringify({ rail }) },
      );
      setCheckoutUrl(intent.checkoutUrl);
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not create payment link',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(paymentId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/reservations/${reservationId}/payments/${paymentId}/confirm`, {
        method: 'POST',
      });
      router.refresh();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : 'Could not confirm payment',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {receipts.length === 0 ? (
        <Alert>No payment links yet.</Alert>
      ) : (
        <ul className="space-y-2">
          {receipts.map((receipt) => (
            <li
              key={receipt.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{receipt.rail.replaceAll('_', ' ')}</Badge>
                <span className="font-medium">
                  {receipt.currency} {Number(receipt.amount).toFixed(2)}
                </span>
                <Badge variant={receipt.status === 'PAID' ? 'success' : 'outline'}>
                  {receipt.status}
                </Badge>
              </div>
              {canManage && receipt.status === 'PENDING' ? (
                <Button size="sm" disabled={busy} onClick={() => confirm(receipt.id)}>
                  Mark paid (mock)
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canCreate ? (
        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="space-y-1">
            <Label htmlFor="payment-rail">Rail</Label>
            <Select
              id="payment-rail"
              value={rail}
              onChange={(event) => setRail(event.target.value as Rail)}
            >
              {RAILS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <Button disabled={busy} onClick={createLink}>
            {busy ? 'Working…' : 'Create payment link'}
          </Button>
        </div>
      ) : null}

      {checkoutUrl ? (
        <p className="text-xs text-muted-foreground">
          Checkout link: <span className="break-all font-mono">{checkoutUrl}</span>
        </p>
      ) : null}
    </div>
  );
}
