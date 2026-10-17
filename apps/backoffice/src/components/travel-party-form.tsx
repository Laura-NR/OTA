'use client';

import type { ReservationPartyDto, TravelerKindDto } from '@ota/schemas';
import { Alert, Button, Checkbox, Input, Label, Radio, Select } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { calendarDate } from '@/lib/ops-format';

import type { PartyOptions } from './travel-party';

const KINDS: readonly TravelerKindDto[] = ['ADULT', 'CHILD', 'INFANT'];

interface RoomRow {
  label: string;
  capacity: string;
}

type UsPersonChoice = 'auto' | 'yes' | 'no';

interface TravelerRow {
  id?: string;
  kind: TravelerKindDto;
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  usPerson: UsPersonChoice;
  hasPassport: boolean;
  passportNumber: string;
  clearPassport: boolean;
  passportExpiresAt: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  room: number | null;
}

const blankTraveler = (): TravelerRow => ({
  kind: 'ADULT',
  fullName: '',
  dateOfBirth: '',
  nationality: '',
  usPerson: 'auto',
  hasPassport: false,
  passportNumber: '',
  clearPassport: false,
  passportExpiresAt: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  room: null,
});

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

/**
 * Replace the party in one PUT: tier, departure, the rooming list and every
 * traveler. A stored passport number is never sent back to the page, so an
 * empty passport field keeps it; "Remove the stored number" clears it.
 */
export function TravelPartyForm({
  reservationId,
  party,
  options,
  onDone,
}: {
  reservationId: string;
  party: ReservationPartyDto;
  options: PartyOptions;
  onDone: () => void;
}) {
  const t = useTranslations('backoffice.reservation.party');
  const locale = useLocale();
  const router = useRouter();

  const [tierId, setTierId] = useState(party.tierId ?? '');
  const [departureId, setDepartureId] = useState(party.departureId ?? '');
  const [rooms, setRooms] = useState<RoomRow[]>(
    party.rooms.map((room) => ({ label: room.label, capacity: String(room.capacity) })),
  );
  const [travelers, setTravelers] = useState<TravelerRow[]>(() =>
    party.travelers.length > 0
      ? party.travelers.map((traveler) => ({
          id: traveler.id,
          kind: traveler.kind,
          fullName: traveler.fullName,
          dateOfBirth: traveler.dateOfBirth ?? '',
          nationality: traveler.nationality ?? '',
          usPerson:
            traveler.usPerson === null ? 'auto' : traveler.usPerson ? 'yes' : 'no',
          hasPassport: traveler.hasPassport,
          passportNumber: '',
          clearPassport: false,
          passportExpiresAt: traveler.passportExpiresAt ?? '',
          emergencyContactName: traveler.emergencyContactName ?? '',
          emergencyContactPhone: traveler.emergencyContactPhone ?? '',
          room: (() => {
            const index = party.rooms.findIndex((room) => room.id === traveler.roomId);
            return index === -1 ? null : index;
          })(),
        }))
      : Array.from({ length: Math.max(1, party.partySize) }, blankTraveler),
  );
  const [lead, setLead] = useState(() =>
    Math.max(
      0,
      party.travelers.findIndex((traveler) => traveler.isLead),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTraveler(index: number, patch: Partial<TravelerRow>) {
    setTravelers((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeTraveler(index: number) {
    setTravelers((current) => current.filter((_, i) => i !== index));
    setLead((current) =>
      current === index ? 0 : current > index ? current - 1 : current,
    );
  }

  function removeRoom(index: number) {
    setRooms((current) => current.filter((_, i) => i !== index));
    setTravelers((current) =>
      current.map((row) => ({
        ...row,
        room:
          row.room === null || row.room === index
            ? null
            : row.room > index
              ? row.room - 1
              : row.room,
      })),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/reservations/${reservationId}/travelers`, {
        method: 'PUT',
        body: JSON.stringify({
          tierId: tierId || null,
          departureId: departureId || null,
          rooms: rooms.map((room) => ({
            label: room.label.trim(),
            capacity: Number(room.capacity),
          })),
          travelers: travelers.map((row, index) => ({
            ...(row.id ? { id: row.id } : {}),
            kind: row.kind,
            isLead: index === lead,
            fullName: row.fullName.trim(),
            dateOfBirth: orNull(row.dateOfBirth),
            nationality: orNull(row.nationality),
            usPerson: row.usPerson === 'auto' ? null : row.usPerson === 'yes',
            // Omitted keeps the stored number; null clears it.
            ...(row.clearPassport
              ? { passportNumber: null }
              : orNull(row.passportNumber)
                ? { passportNumber: row.passportNumber.trim() }
                : {}),
            passportExpiresAt: orNull(row.passportExpiresAt),
            emergencyContactName: orNull(row.emergencyContactName),
            emergencyContactPhone: orNull(row.emergencyContactPhone),
            room: row.room,
          })),
        }),
      });
      router.refresh();
      onDone();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      {party.priced ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="party-tier">{t('tier')}</Label>
            <Select
              id="party-tier"
              value={tierId}
              onChange={(event) => setTierId(event.target.value)}
            >
              <option value="">{t('noTier')}</option>
              {options.tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="party-departure">{t('departure')}</Label>
            <Select
              id="party-departure"
              value={departureId}
              onChange={(event) => setDepartureId(event.target.value)}
            >
              <option value="">{t('noDeparture')}</option>
              {options.departures.map((departure) => (
                <option key={departure.id} value={departure.id}>
                  {calendarDate(departure.startDate, locale)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-body-sm font-semibold">{t('rooms')}</legend>
        {rooms.map((room, index) => (
          <div
            key={index}
            className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`party-room-${index}-label`}>
                {t('roomLabel')} {index + 1}
              </Label>
              <Input
                id={`party-room-${index}-label`}
                value={room.label}
                required
                maxLength={60}
                onChange={(event) =>
                  setRooms((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, label: event.target.value } : row,
                    ),
                  )
                }
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`party-room-${index}-capacity`}>{t('roomCapacity')}</Label>
              <Input
                id={`party-room-${index}-capacity`}
                type="number"
                min={1}
                max={6}
                value={room.capacity}
                onChange={(event) =>
                  setRooms((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, capacity: event.target.value } : row,
                    ),
                  )
                }
              />
            </div>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              className="justify-self-start"
              onClick={() => removeRoom(index)}
            >
              {t('removeRoom')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() =>
            setRooms((current) => [...current, { label: '', capacity: '2' }])
          }
        >
          {t('addRoom')}
        </Button>
      </fieldset>

      {travelers.map((row, index) => {
        const id = (field: string) => `party-${index}-${field}`;
        return (
          <fieldset key={row.id ?? `new-${index}`} className="rounded-md border p-4">
            <legend className="px-1 text-body-sm font-semibold">
              {t('travelerHeading', { number: index + 1 })}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={id('fullName')}>{t('fullName')}</Label>
                <Input
                  id={id('fullName')}
                  value={row.fullName}
                  required
                  maxLength={200}
                  onChange={(event) =>
                    updateTraveler(index, { fullName: event.target.value })
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('kind')}>{t('kind')}</Label>
                <Select
                  id={id('kind')}
                  value={row.kind}
                  onChange={(event) =>
                    updateTraveler(index, { kind: event.target.value as TravelerKindDto })
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`kinds.${kind}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('dateOfBirth')}>{t('dateOfBirth')}</Label>
                <Input
                  id={id('dateOfBirth')}
                  type="date"
                  value={row.dateOfBirth}
                  required={row.kind !== 'ADULT'}
                  aria-describedby={id('dateOfBirth-hint')}
                  onChange={(event) =>
                    updateTraveler(index, { dateOfBirth: event.target.value })
                  }
                />
                <span id={id('dateOfBirth-hint')} className="text-caption text-muted">
                  {t('dateOfBirthHint')}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('nationality')}>{t('nationality')}</Label>
                <Input
                  id={id('nationality')}
                  value={row.nationality}
                  minLength={2}
                  maxLength={2}
                  autoComplete="off"
                  onChange={(event) =>
                    updateTraveler(index, {
                      nationality: event.target.value.toUpperCase(),
                    })
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('usPerson')}>{t('usPerson')}</Label>
                <Select
                  id={id('usPerson')}
                  value={row.usPerson}
                  onChange={(event) =>
                    updateTraveler(index, {
                      usPerson: event.target.value as UsPersonChoice,
                    })
                  }
                >
                  {(['auto', 'yes', 'no'] as const).map((choice) => (
                    <option key={choice} value={choice}>
                      {t(`usPersonOptions.${choice}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('room')}>{t('room')}</Label>
                <Select
                  id={id('room')}
                  value={row.room === null ? '' : String(row.room)}
                  onChange={(event) =>
                    updateTraveler(index, {
                      room: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                >
                  <option value="">{t('noRoom')}</option>
                  {rooms.map((room, roomIndex) => (
                    <option key={roomIndex} value={roomIndex}>
                      {room.label || `${t('roomLabel')} ${roomIndex + 1}`}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('passportNumber')}>{t('passportNumber')}</Label>
                <Input
                  id={id('passportNumber')}
                  value={row.passportNumber}
                  autoComplete="off"
                  maxLength={30}
                  disabled={row.clearPassport}
                  placeholder={row.hasPassport ? t('passportKeep') : undefined}
                  onChange={(event) =>
                    updateTraveler(index, { passportNumber: event.target.value })
                  }
                />
                {row.hasPassport ? (
                  <Checkbox
                    id={id('clearPassport')}
                    checked={row.clearPassport}
                    onChange={(event) =>
                      updateTraveler(index, {
                        clearPassport: event.target.checked,
                        passportNumber: '',
                      })
                    }
                    label={t('passportClear')}
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('passportExpiresAt')}>{t('passportExpiry')}</Label>
                <Input
                  id={id('passportExpiresAt')}
                  type="date"
                  value={row.passportExpiresAt}
                  onChange={(event) =>
                    updateTraveler(index, { passportExpiresAt: event.target.value })
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('emergencyName')}>{t('emergencyName')}</Label>
                <Input
                  id={id('emergencyName')}
                  value={row.emergencyContactName}
                  maxLength={200}
                  onChange={(event) =>
                    updateTraveler(index, { emergencyContactName: event.target.value })
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id('emergencyPhone')}>{t('emergencyPhone')}</Label>
                <Input
                  id={id('emergencyPhone')}
                  type="tel"
                  value={row.emergencyContactPhone}
                  maxLength={40}
                  onChange={(event) =>
                    updateTraveler(index, { emergencyContactPhone: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Radio
                name="party-lead"
                checked={lead === index}
                onChange={() => setLead(index)}
                label={t('isLead')}
              />
              {travelers.length > 1 ? (
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  onClick={() => removeTraveler(index)}
                >
                  {t('removeTraveler')}
                </Button>
              ) : null}
            </div>
          </fieldset>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => setTravelers((current) => [...current, blankTraveler()])}
      >
        {t('addTraveler')}
      </Button>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t('saving') : t('save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone} disabled={busy}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
