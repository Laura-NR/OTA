'use client';

import { ageOn, isUsPerson } from '@ota/domain';
import type {
  PackageDepartureDto,
  PackageExtraDto,
  PackageTierDto,
  ReservationPartyDto,
  ReservationTravelerDto,
  TravelerPassportDto,
} from '@ota/schemas';
import { Alert, Badge, Button, Input, Label, Select } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { calendarDate, moneyExact } from '@/lib/ops-format';

import { TravelPartyForm } from './travel-party-form';

export interface PartyOptions {
  tiers: PackageTierDto[];
  departures: PackageDepartureDto[];
  extras: PackageExtraDto[];
}

const OTHER = 'other';

/**
 * The booking's travel party (A-Booking "Travelers", M2): who travels, the
 * tier and departure, the rooming list and the extras. The passport number is
 * never in the page; "Show passport number" fetches it from the audited vault
 * route for one traveler at a time.
 */
export function TravelParty({
  reservationId,
  party,
  options,
  startDate,
  currency,
  canManage,
}: {
  reservationId: string;
  party: ReservationPartyDto;
  options: PartyOptions;
  startDate: string;
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations('backoffice.reservation.party');
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tier = options.tiers.find((candidate) => candidate.id === party.tierId) ?? null;
  const departure =
    options.departures.find((candidate) => candidate.id === party.departureId) ?? null;
  const travelDate = departure?.startDate ?? startDate;
  const canExtend = canManage && party.priced && !party.priceLocked;

  if (editing) {
    return (
      <TravelPartyForm
        reservationId={reservationId}
        party={party}
        options={options}
        onDone={() => setEditing(false)}
      />
    );
  }

  async function reveal(travelerId: string) {
    setRevealing(travelerId);
    setError(null);
    try {
      const passport = await apiRequest<TravelerPassportDto>(
        `/reservations/${reservationId}/travelers/${travelerId}/passport`,
      );
      setRevealed((current) => ({ ...current, [travelerId]: passport.passportNumber }));
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : t('revealFailed'));
    } finally {
      setRevealing(null);
    }
  }

  function role(traveler: ReservationTravelerDto): string {
    if (traveler.kind !== 'ADULT' && traveler.dateOfBirth) {
      const age = ageOn(new Date(traveler.dateOfBirth), new Date(travelDate));
      return t(traveler.kind === 'CHILD' ? 'child' : 'infant', { age });
    }
    if (traveler.kind !== 'ADULT') {
      return t(`kinds.${traveler.kind}`);
    }
    return traveler.isLead ? t('lead') : t('companion');
  }

  const roomNames = (roomId: string) =>
    party.travelers
      .filter((traveler) => traveler.roomId === roomId)
      .map((traveler) => traveler.fullName)
      .join(', ');

  return (
    <div className="flex flex-col gap-5">
      {party.priceLocked ? <Alert variant="info">{t('lockedNote')}</Alert> : null}
      {!party.priced ? (
        <p className="text-caption text-muted">{t('customNote')}</p>
      ) : null}

      {party.priced ? (
        <dl className="grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-muted">{t('tier')}</dt>
          <dd>{tier ? tier.name : t('noTier')}</dd>
          <dt className="text-muted">{t('departure')}</dt>
          <dd>
            {departure ? calendarDate(departure.startDate, locale) : t('noDeparture')}
          </dd>
        </dl>
      ) : null}

      {party.travelers.length === 0 ? (
        <p className="text-body-sm text-muted">
          {t('empty', { count: party.partySize })}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border text-body-sm">
          {party.travelers.map((traveler) => (
            <li key={traveler.id} className="flex flex-col gap-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{traveler.fullName}</span>
                <Badge variant={traveler.isLead ? 'secondary' : 'outline'}>
                  {role(traveler)}
                </Badge>
                {isUsPerson(traveler) ? (
                  <Badge variant="info">{t('usPersonBadge')}</Badge>
                ) : null}
              </div>
              <p className="text-caption text-muted">
                {[
                  traveler.dateOfBirth
                    ? t('born', { year: traveler.dateOfBirth.slice(0, 4) })
                    : null,
                  traveler.nationality,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {traveler.hasPassport ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    {traveler.passportExpiresAt
                      ? t('passportExpires', {
                          date: calendarDate(traveler.passportExpiresAt, locale),
                        })
                      : t('passportOnFile')}
                  </span>
                  {revealed[traveler.id] ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{revealed[traveler.id]}</span>
                      <span className="text-caption text-muted">{t('revealed')}</span>
                    </span>
                  ) : canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      onClick={() => reveal(traveler.id)}
                      disabled={revealing !== null}
                    >
                      {revealing === traveler.id ? t('revealing') : t('reveal')}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <span className="text-muted">{t('noPassport')}</span>
              )}
              {traveler.emergencyContactName && traveler.emergencyContactPhone ? (
                <span className="text-secondary">
                  {t('emergency', {
                    name: traveler.emergencyContactName,
                    phone: traveler.emergencyContactPhone,
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-body-sm font-semibold">{t('rooms')}</h3>
        {party.rooms.length === 0 ? (
          <p className="text-body-sm text-muted">{t('noRooms')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body-sm">
            {party.rooms.map((room) => (
              <li key={room.id}>
                <span className="font-medium">
                  {t('roomLine', { label: room.label, capacity: room.capacity })}
                </span>
                <span className="text-secondary">
                  {' · '}
                  {roomNames(room.id) || t('unassigned')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {party.priced ? (
        <PartyExtras
          reservationId={reservationId}
          party={party}
          options={options.extras}
          currency={currency}
          canExtend={canExtend}
          onChanged={() => router.refresh()}
        />
      ) : null}

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {canManage ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setEditing(true)}
        >
          {t('edit')}
        </Button>
      ) : null}
    </div>
  );
}

function PartyExtras({
  reservationId,
  party,
  options,
  currency,
  canExtend,
  onChanged,
}: {
  reservationId: string;
  party: ReservationPartyDto;
  options: PackageExtraDto[];
  currency: string;
  canExtend: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('backoffice.reservation.party');
  const locale = useLocale();
  const offered = options.filter((extra) => extra.active);
  const [choice, setChoice] = useState<string>(offered[0]?.id ?? OTHER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(extraId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/reservations/${reservationId}/extras/${extraId}`, {
        method: 'DELETE',
      });
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t('extraFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const quantity = Number(form.get('quantity') || 1);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/reservations/${reservationId}/extras`, {
        method: 'POST',
        body: JSON.stringify(
          choice === OTHER
            ? {
                label: form.get('label'),
                unit: form.get('unit'),
                unitAmount: form.get('unitAmount'),
                quantity,
              }
            : { packageExtraId: choice, quantity },
        ),
      });
      element.reset();
      onChanged();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : t('extraFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-body-sm font-semibold">{t('extras')}</h3>
      {party.extras.length === 0 ? (
        <p className="text-body-sm text-muted">{t('noExtras')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border text-body-sm">
          {party.extras.map((extra) => (
            <li
              key={extra.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
            >
              <span className="font-medium">{extra.label}</span>
              <span className="text-caption text-muted">
                {t('extraLine', {
                  quantity: extra.quantity,
                  unitAmount: moneyExact(
                    Number(extra.unitAmount),
                    extra.currency,
                    locale,
                  ),
                  unit: t(`units.${extra.unit}`),
                })}
              </span>
              <span className="ml-auto font-mono">
                {moneyExact(Number(extra.amount), extra.currency, locale)}
              </span>
              {canExtend ? (
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  onClick={() => remove(extra.id)}
                  disabled={busy}
                >
                  {t('removeExtra')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canExtend ? (
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="party-extra-choice">{t('extraChoice')}</Label>
              <Select
                id="party-extra-choice"
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
              >
                {offered.map((extra) => (
                  <option key={extra.id} value={extra.id}>
                    {extra.name} · {moneyExact(Number(extra.price), currency, locale)}{' '}
                    {t(`units.${extra.priceUnit}`)}
                  </option>
                ))}
                <option value={OTHER}>{t('otherExtra')}</option>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="party-extra-quantity">{t('quantity')}</Label>
              <Input
                id="party-extra-quantity"
                name="quantity"
                type="number"
                min={1}
                max={50}
                defaultValue={1}
              />
            </div>
          </div>
          {choice === OTHER ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="party-extra-label">{t('extraLabel')}</Label>
                <Input id="party-extra-label" name="label" required maxLength={120} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="party-extra-unit">{t('extraUnit')}</Label>
                <Select id="party-extra-unit" name="unit" defaultValue="PER_PERSON">
                  <option value="PER_PERSON">{t('units.PER_PERSON')}</option>
                  <option value="PER_BOOKING">{t('units.PER_BOOKING')}</option>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="party-extra-amount">{t('unitAmount')}</Label>
                <Input
                  id="party-extra-amount"
                  name="unitAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                />
              </div>
            </div>
          ) : null}
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <Button type="submit" size="sm" className="self-start" disabled={busy}>
            {busy ? t('adding') : t('addExtra')}
          </Button>
        </form>
      ) : error ? (
        <Alert variant="destructive">{error}</Alert>
      ) : null}
    </div>
  );
}
