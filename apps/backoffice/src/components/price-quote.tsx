'use client';

import type { PriceQuoteDto } from '@ota/schemas';
import { Alert, Button, Input, Label } from '@ota/ui';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export function PriceQuote({ inventoryItemId }: { inventoryItemId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quote, setQuote] = useState<PriceQuoteDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setQuote(
        await apiRequest<PriceQuoteDto>(
          `/inventory/${inventoryItemId}/price?date=${date}`,
        ),
      );
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : 'Could not price item');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`price-date-${inventoryItemId}`}>Price on</Label>
          <Input
            id={`price-date-${inventoryItemId}`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={load}>
          {busy ? '…' : 'Quote'}
        </Button>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {quote ? (
        <p className="text-xs text-muted-foreground">
          base {quote.base.toFixed(2)} · seasonal {quote.seasonal.toFixed(2)} · markup{' '}
          {quote.markup.toFixed(2)} →{' '}
          <span className="font-medium text-foreground">{quote.total.toFixed(2)}</span>
        </p>
      ) : null}
    </div>
  );
}
