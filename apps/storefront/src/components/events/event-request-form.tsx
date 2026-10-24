'use client';

import type { EventLinkTargetsDto, PublicEventDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Checkbox,
  Counter,
  Input,
  Label,
  Radio,
  RadioGroup,
  Select,
  Stepper,
  Textarea,
  buttonClassName,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import type { CountryOption } from '@/lib/countries';
import { nightLabel } from '@/lib/event-dates';
import { formatMoney, plainSpaces } from '@/lib/format';

const STEP_IDS = ['seats', 'trip', 'send'] as const;
const DAY_MS = 86_400_000;

type Path = 'BUILD' | 'EXISTING' | 'TICKETS_ONLY';

interface Sent {
  reference: string;
  customRequestReference: string | null;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function nightsBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS);
}

/**
 * The Concierge board's request in three steps (M10 D3–D5): the nights, seats
 * and category; where the tickets go (a trip to build, one of the traveler's
 * own trips, or tickets only); then the contact details the account lacks.
 * Sending stores a request, never a payment: seats are charged only once the
 * desk confirms them.
 */
export function EventRequestForm({
  event,
  maxSeats,
  feePerSeat,
  currency,
  linkTargets,
  afterOptions,
  needsPhone,
  needsNationality,
  countries,
  email,
  arrivalAdvice,
  usNote,
}: {
  event: PublicEventDto;
  maxSeats: number;
  feePerSeat: number;
  currency: string;
  linkTargets: EventLinkTargetsDto;
  /** Where a trip can go after the festival: the tenant's served provinces. */
  afterOptions: readonly { code: string; name: string }[];
  needsPhone: boolean;
  needsNationality: boolean;
  countries: readonly CountryOption[];
  email: string;
  arrivalAdvice: string | null;
  usNote: string | null;
}) {
  const t = useTranslations('events.request');
  const locale = useLocale();
  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState(event.categories[0]?.id ?? '');
  const [nightIds, setNightIds] = useState<string[]>([]);
  const [seats, setSeats] = useState(2);
  const [path, setPath] = useState<Path>('BUILD');
  const [arrival, setArrival] = useState('');
  const [totalNights, setTotalNights] = useState(0);
  const [after, setAfter] = useState('');
  const [target, setTarget] = useState(
    linkTargets.bookings[0]
      ? `booking:${linkTargets.bookings[0].id}`
      : linkTargets.customRequests[0]
        ? `request:${linkTargets.customRequests[0].id}`
        : '',
  );
  const [phone, setPhone] = useState('');
  const [nationality, setNationality] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const category = event.categories.find((candidate) => candidate.id === categoryId);
  const isPass = category?.kind === 'PASS';
  const chosenNights = event.nights.filter((night) => nightIds.includes(night.id));
  const tickets = isPass ? seats : seats * chosenNights.length;
  const first = isPass ? event.startsOn : (chosenNights[0]?.date ?? event.startsOn);
  const last = isPass ? event.endsOn : (chosenNights.at(-1)?.date ?? event.endsOn);
  const festivalNights = arrival ? nightsBetween(arrival, addDays(last, 1)) : 0;
  const money = (amount: number) => plainSpaces(formatMoney(amount, currency, locale));

  const stepOneValid = Boolean(category) && (isPass || chosenNights.length > 0);
  const stepTwoValid =
    path === 'TICKETS_ONLY' ||
    (path === 'EXISTING' && target !== '') ||
    (path === 'BUILD' &&
      arrival !== '' &&
      arrival <= first &&
      totalNights >= festivalNights &&
      totalNights <= 30);

  function toggleNight(id: string) {
    setNightIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function goToTrip() {
    // The board's advice: arrive two nights before, then a few days after.
    if (!arrival) {
      const suggested = addDays(first, -2);
      setArrival(suggested);
      setTotalNights(nightsBetween(suggested, addDays(last, 1)) + 3);
    }
    setStep(2);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const [kind, id] = target.split(':');
    try {
      const response = await fetch('/api/ota/me/event-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventSlug: event.slug,
          categoryId,
          nightIds: isPass ? [] : nightIds,
          seats,
          path,
          ...(path === 'BUILD'
            ? { arrival, totalNights, afterProvince: after || null }
            : {}),
          ...(path === 'EXISTING'
            ? kind === 'booking'
              ? { reservationId: id }
              : { customRequestId: id }
            : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(nationality ? { nationality } : {}),
          locale,
        }),
      });
      if (!response.ok) {
        throw new Error(t('error'));
      }
      setSent((await response.json()) as Sent);
      setStep(4);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h3 className="font-display text-h2-compact text-default">
          {t('sent.title', { reference: sent.reference })}
        </h3>
        <p className="text-body text-secondary">
          {t('sent.body', { hours: event.answerHours })}
        </p>
        {event.confirmBy ? (
          <p className="text-body text-secondary">
            {t('sent.confirmBy', {
              date: plainSpaces(
                new Intl.DateTimeFormat(locale, {
                  timeZone: 'UTC',
                  dateStyle: 'long',
                }).format(new Date(event.confirmBy)),
              ),
            })}
          </p>
        ) : null}
        {sent.customRequestReference ? (
          <p className="text-body-sm text-muted">
            {t('sent.trip', { reference: sent.customRequestReference })}
          </p>
        ) : null}
        <Link href="/account" className={buttonClassName({ variant: 'primary' })}>
          {t('sent.track')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        steps={STEP_IDS.map((id, index) => ({
          id,
          label: t(`steps.${id}`),
          state: index + 1 < step ? 'done' : index + 1 === step ? 'current' : 'upcoming',
        }))}
        progressLabel={t('progress', {
          step,
          total: STEP_IDS.length,
          label: t(`steps.${STEP_IDS[step - 1]!}`),
        })}
      />

      {step === 1 ? (
        <div className="flex flex-col gap-6">
          <RadioGroup legend={t('category')}>
            {event.categories.map((option) => (
              <Radio
                key={option.id}
                name="category"
                value={option.id}
                checked={categoryId === option.id}
                onChange={() => setCategoryId(option.id)}
                label={option.name}
                description={[
                  option.description,
                  option.pricePerSeat === null
                    ? t('priceLater')
                    : t('pricePerSeat', { price: money(option.pricePerSeat) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </RadioGroup>

          {isPass ? (
            <p className="text-body-sm text-secondary">{t('passCovers')}</p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-body font-medium text-default">
                {t('nights', { count: chosenNights.length, total: event.nights.length })}
              </legend>
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {event.nights.map((night) => (
                  <Checkbox
                    key={night.id}
                    label={`${nightLabel(night.date, locale)} · ${night.label}`}
                    description={night.venue ?? undefined}
                    checked={nightIds.includes(night.id)}
                    onChange={() => toggleNight(night.id)}
                    className="py-1.5"
                  />
                ))}
              </div>
            </fieldset>
          )}

          <Counter
            label={t('seats')}
            description={t('seatsHint', { max: maxSeats })}
            value={seats}
            min={1}
            max={maxSeats}
            onValueChange={setSeats}
            decrementLabel={t('seatsLess')}
            incrementLabel={t('seatsMore')}
            className="max-w-md"
          />
          <p className="text-body-sm text-secondary">
            {t('tickets', { count: tickets })} {t('fee', { fee: money(feePerSeat) })}
          </p>
          {!stepOneValid ? (
            <p className="text-body-sm text-muted">{t('pickNight')}</p>
          ) : null}
          <Button className="self-start" disabled={!stepOneValid} onClick={goToTrip}>
            {t('continueTrip')}
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-6">
          <RadioGroup legend={t('where')}>
            {(['BUILD', 'EXISTING', 'TICKETS_ONLY'] as const).map((value) => (
              <Radio
                key={value}
                name="path"
                value={value}
                checked={path === value}
                onChange={() => setPath(value)}
                label={t(`paths.${value}.label`)}
                description={t(`paths.${value}.description`)}
              />
            ))}
          </RadioGroup>

          {path === 'BUILD' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="event-arrival">{t('arrival')}</Label>
                <Input
                  id="event-arrival"
                  type="date"
                  max={first}
                  value={arrival}
                  onChange={(change) => setArrival(change.target.value)}
                />
                {arrivalAdvice ? (
                  <p className="text-caption text-muted">{arrivalAdvice}</p>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="event-total-nights">{t('totalNights')}</Label>
                <Input
                  id="event-total-nights"
                  type="number"
                  min={Math.max(1, festivalNights)}
                  max={30}
                  value={totalNights || ''}
                  onChange={(change) => setTotalNights(Number(change.target.value))}
                />
                <p className="text-caption text-muted">
                  {t('festivalNights', { count: Math.max(0, festivalNights) })}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="event-after">{t('after')}</Label>
                <Select
                  id="event-after"
                  value={after}
                  onChange={(change) => setAfter(change.target.value)}
                >
                  <option value="">{t('stay')}</option>
                  {afterOptions
                    .filter((option) => option.code !== event.province)
                    .map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                </Select>
              </div>
              {arrival && arrival > first ? (
                <Alert variant="warning" className="sm:col-span-2">
                  {t('arriveBefore')}
                </Alert>
              ) : null}
            </div>
          ) : null}

          {path === 'EXISTING' ? (
            linkTargets.bookings.length + linkTargets.customRequests.length === 0 ? (
              <Alert variant="info">{t('noTrips')}</Alert>
            ) : (
              <div className="flex max-w-md flex-col gap-1.5">
                <Label htmlFor="event-target">{t('yourTrip')}</Label>
                <Select
                  id="event-target"
                  value={target}
                  onChange={(change) => setTarget(change.target.value)}
                >
                  {linkTargets.bookings.map((booking) => (
                    <option key={booking.id} value={`booking:${booking.id}`}>
                      {t('bookingOption', { code: booking.bookingCode })}
                    </option>
                  ))}
                  {linkTargets.customRequests.map((request) => (
                    <option key={request.id} value={`request:${request.id}`}>
                      {t('requestOption', { reference: request.reference })}
                    </option>
                  ))}
                </Select>
              </div>
            )
          ) : null}

          {path === 'TICKETS_ONLY' ? (
            <p className="text-body-sm text-secondary">{t('ticketsOnlyNote')}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              {t('back')}
            </Button>
            <Button disabled={!stepTwoValid} onClick={() => setStep(3)}>
              {t('continueSend')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-5">
          <p className="text-body text-secondary">{t('signedInAs', { email })}</p>
          {needsPhone ? (
            <div className="flex max-w-md flex-col gap-1.5">
              <Label htmlFor="event-phone">{t('phone')}</Label>
              <Input
                id="event-phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                value={phone}
                onChange={(change) => setPhone(change.target.value)}
              />
            </div>
          ) : null}
          {needsNationality ? (
            <div className="flex max-w-md flex-col gap-1.5">
              <Label htmlFor="event-nationality">{t('nationality')}</Label>
              <Select
                id="event-nationality"
                value={nationality}
                onChange={(change) => setNationality(change.target.value)}
              >
                <option value="">{t('nationalityNone')}</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-notes">{t('notes')}</Label>
            <Textarea
              id="event-notes"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(change) => setNotes(change.target.value)}
            />
          </div>
          {usNote ? <p className="text-caption text-muted">{usNote}</p> : null}
          <p className="text-body-sm text-secondary">
            {t('nothingCharged', { tickets, fee: money(feePerSeat) })}
          </p>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              {t('back')}
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {t('send')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
