'use client';

import type { ReservationDetailDto } from '@ota/schemas';
import { Alert, Button, Input, Label } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Ops-side booking intake. Lands the new reservation on its workbench. */
export function ReservationCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const reservation = await apiRequest<ReservationDetailDto>('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          travelerEmail: form.get('travelerEmail'),
          startDate: form.get('startDate'),
          endDate: form.get('endDate'),
          totalCurrency: form.get('totalCurrency') || 'EUR',
          totalAmount: Number(form.get('totalAmount') || 0),
        }),
      });
      router.push(`/reservations/${reservation.id}`);
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Could not create booking',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="traveler-email">Traveler email</Label>
          <Input
            id="traveler-email"
            name="travelerEmail"
            type="email"
            required
            placeholder="traveler@example.test"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="total-amount">Total amount</Label>
          <Input
            id="total-amount"
            name="totalAmount"
            type="number"
            min="0"
            step="0.01"
            placeholder="480.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="start-date">Start date</Label>
          <Input id="start-date" name="startDate" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End date</Label>
          <Input id="end-date" name="endDate" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="total-currency">Currency</Label>
          <Input
            id="total-currency"
            name="totalCurrency"
            defaultValue="EUR"
            maxLength={3}
          />
        </div>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create booking'}
      </Button>
    </form>
  );
}
