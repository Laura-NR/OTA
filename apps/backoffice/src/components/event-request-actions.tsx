'use client';

import { isOpenEventRequest, isPriceLocked, ticketCharges } from '@ota/domain';
import type { ReservationStatus } from '@ota/domain';
import type { EventRequestDetailDto } from '@ota/schemas';
import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';
import { moneyExact } from '@/lib/ops-format';

type Mode = 'idle' | 'unavailable' | 'cancel' | 'confirm';

/**
 * The desk's answer to an event request (M10 D3, D6): say the seats can be
 * requested, confirm them onto a booking at the price actually paid, or close
 * the request with a reason. Confirming shows what the seats add before it is
 * sent, and whether they fall due as their own instalment.
 */
export function EventRequestActions({
  request,
  locale,
}: {
  request: EventRequestDetailDto;
  locale: string;
}) {
  const t = useTranslations('eventRequestsDesk');
  const why = useTranslations('backoffice.unavailable');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState('');
  const [price, setPrice] = useState(
    request.indicativePricePerSeat === null ? '' : String(request.indicativePricePerSeat),
  );
  const [bookingId, setBookingId] = useState(request.linkableBookings[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest<EventRequestDetailDto>(`/event-requests/${request.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMode('idle');
      setReason('');
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actions.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!isOpenEventRequest(request.status)) {
    return <p className="text-body-sm text-muted">{t('actions.closed')}</p>;
  }
  const priceValue = Number(price);
  const priceValid =
    price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0;
  const charges = priceValid
    ? ticketCharges(request.tickets, priceValue, request.feePerSeatDefault)
    : null;
  const needsBooking = request.reservationId === null;
  const chosen = request.linkableBookings.find((booking) => booking.id === bookingId);
  const locked = needsBooking
    ? chosen
      ? isPriceLocked(chosen.status as ReservationStatus)
      : false
    : Boolean(request.priceLocked);

  return (
    <div className="flex flex-col gap-3">
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          {request.status === 'SUBMITTED' ? (
            <Button disabled={busy} onClick={() => void post('requesting', {})}>
              {t('actions.requesting')}
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => setMode('confirm')}>
              {t('actions.confirm')}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setMode('unavailable')}
          >
            {t('actions.unavailable')}
          </Button>
          <Button variant="tertiary" disabled={busy} onClick={() => setMode('cancel')}>
            {t('actions.cancel')}
          </Button>
        </div>
      ) : null}

      {mode === 'unavailable' || mode === 'cancel' ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void post(mode, { reason });
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[360px]">
            <Label htmlFor="request-reason">{t('actions.reason')}</Label>
            <Input
              id="request-reason"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(change) => setReason(change.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant={mode === 'cancel' ? 'destructive' : 'primary'}
            disabled={busy}
            unavailableReason={
              reason.trim().length < 3
                ? why('minLength', { min: 3, field: t('actions.reason') })
                : undefined
            }
          >
            {mode === 'cancel'
              ? t('actions.confirmCancel')
              : t('actions.confirmUnavailable')}
          </Button>
          <Button type="button" variant="tertiary" onClick={() => setMode('idle')}>
            {t('actions.back')}
          </Button>
        </form>
      ) : null}

      {mode === 'confirm' ? (
        <form
          className="flex flex-col gap-3"
          aria-label={t('actions.confirmTitle')}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void post('confirm', {
              pricePerSeat: priceValue,
              ...(needsBooking ? { reservationId: bookingId } : {}),
            });
          }}
        >
          <div className="flex flex-col gap-1.5 sm:max-w-[240px]">
            <Label htmlFor="request-price">{t('actions.pricePerSeat')}</Label>
            <Input
              id="request-price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              required
              value={price}
              onChange={(change) => setPrice(change.target.value)}
            />
          </div>
          {needsBooking ? (
            request.linkableBookings.length === 0 ? (
              <Alert variant="warning">{t('actions.noBooking')}</Alert>
            ) : (
              <div className="flex flex-col gap-1.5 sm:max-w-[320px]">
                <Label htmlFor="request-booking">{t('actions.booking')}</Label>
                <Select
                  id="request-booking"
                  value={bookingId}
                  onChange={(change) => setBookingId(change.target.value)}
                >
                  {request.linkableBookings.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      {booking.bookingCode}
                    </option>
                  ))}
                </Select>
              </div>
            )
          ) : null}
          {charges ? (
            <p className="text-body-sm">
              {t('actions.adds', {
                tickets: request.tickets,
                seats: moneyExact(charges.ticketsAmount, request.currency, locale),
                fee: moneyExact(charges.feeAmount, request.currency, locale),
                total: moneyExact(charges.total, request.currency, locale),
              })}
            </p>
          ) : null}
          <p className="text-caption text-muted">
            {locked ? t('actions.lockedNote') : t('actions.openNote')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={busy}
              unavailableReason={
                !priceValid
                  ? why('seatsPrice')
                  : needsBooking && !bookingId
                    ? why('seatsBooking')
                    : undefined
              }
            >
              {t('actions.confirmSeats')}
            </Button>
            <Button type="button" variant="tertiary" onClick={() => setMode('idle')}>
              {t('actions.back')}
            </Button>
          </div>
        </form>
      ) : null}

      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
