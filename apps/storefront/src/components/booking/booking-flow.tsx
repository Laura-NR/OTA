'use client';

import {
  INFANT_UNDER_AGE,
  OFAC_CATEGORIES,
  ageOn,
  planRooms,
  priceBooking,
  signatureMatches,
  travelerKindOn,
  type BookingFeeInput,
  type BookingPrice,
  type ChildBand,
  type ConsentPurpose,
  type OfacCategory,
  type Rooming,
  type TravelerKind,
} from '@ota/domain';
import type { LegalText, PackageDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Counter,
  Field,
  Icon,
  Input,
  Radio,
  RadioGroup,
  Select,
  Stepper,
  Textarea,
  buttonClassName,
  cn,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';

import { Link } from '@/i18n/navigation';
import type { CountryOption } from '@/lib/countries';
import { formatMoney, plainSpaces } from '@/lib/format';

export interface BookingDeparture {
  id: string;
  startDate: string;
  capacity: number;
  price: string | null;
  /** The date and price, formatted on the server. */
  label: string;
  priceLabel: string;
}

export interface BookingLegal {
  statement: LegalText | null;
  consents: Partial<Record<ConsentPurpose, LegalText>>;
}

export interface BookingFlowProps {
  pkg: PackageDto;
  /** "3 days · 2 nights", in the visitor's language. */
  length: string;
  /** Open departures outside the lead time. */
  departures: BookingDeparture[];
  pricing: { childBands: readonly ChildBand[]; fees: readonly BookingFeeInput[] };
  legal: BookingLegal;
  countries: CountryOption[];
  /** The signed-in traveler, who is the lead traveler. */
  email: string;
  leadName: string;
  /** Today (YYYY-MM-DD) on the server, the latest date of birth allowed. */
  today: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_IDS = ['dates', 'stay', 'extras', 'travelers', 'review'] as const;

const KINDS: readonly TravelerKind[] = ['ADULT', 'CHILD', 'INFANT'];

/** Step 1's counter message keys per kind. */
const COUNTER_KEYS: Record<TravelerKind, { plural: string; one: string }> = {
  ADULT: { plural: 'adults', one: 'Adult' },
  CHILD: { plural: 'children', one: 'Child' },
  INFANT: { plural: 'infants', one: 'Infant' },
};

/** The most travelers one booking takes (the API's limit). */
const MAX_PARTY = 20;

/** The consents step 5 asks for, as the API requires them. */
const REQUIRED: readonly ConsentPurpose[] = [
  'TERMS',
  'PRIVACY_NOTICE',
  'CANCELLATION_POLICY',
  'INSURANCE_ACKNOWLEDGEMENT',
];

interface TravelerDraft {
  firstNames: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  passportNumber: string;
}

interface CertificationDraft {
  category: OfacCategory;
  signature: string;
}

interface Slot {
  /** The kind counted in step 1. */
  kind: TravelerKind;
  /** Position within its kind, to keep drafts when counts change. */
  index: number;
  draft: TravelerDraft;
}

const emptyDraft = (): TravelerDraft => ({
  firstNames: '',
  lastName: '',
  dateOfBirth: '',
  nationality: '',
  passportNumber: '',
});

function resize<T>(list: T[], length: number, make: () => T): T[] {
  return list.length >= length
    ? list.slice(0, length)
    : [...list, ...Array.from({ length: length - list.length }, make)];
}

/** A YYYY-MM-DD date of birth as a UTC date, or null when incomplete or in the future. */
function birthDate(value: string, today: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fullName(draft: TravelerDraft): string {
  return `${draft.firstNames.trim()} ${draft.lastName.trim()}`.trim();
}

const normalisePassport = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();

/**
 * The Booking board (five steps: dates and travelers, stay, insurance and
 * extras, travelers, review). The summary prices the choices with the same
 * domain rules the API uses (`priceBooking`, `planRooms`, kinds from the date
 * of birth); the API prices them again on submit and refuses a total that
 * moved. US travelers certify their travel category in step 4, and step 5
 * records the booking consents against the tenant's text versions.
 */
export function BookingFlow({
  pkg,
  length,
  departures,
  pricing,
  legal,
  countries,
  email,
  leadName,
  today,
}: BookingFlowProps) {
  const t = useTranslations('booking');
  const tofac = useTranslations('account.ofac');
  const categories = useTranslations('ofac.categories');
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [departureId, setDepartureId] = useState(departures[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<TravelerKind, TravelerDraft[]>>(() => {
    const words = leadName.trim().split(/\s+/).filter(Boolean);
    const lead: TravelerDraft = {
      ...emptyDraft(),
      firstNames: words.slice(0, -1).join(' ') || (words[0] ?? ''),
      lastName: words.length > 1 ? words.at(-1)! : '',
    };
    return { ADULT: [lead, emptyDraft()], CHILD: [], INFANT: [] };
  });
  const [rooming, setRooming] = useState<Rooming>('SHARE');
  const [roommateMatch, setRoommateMatch] = useState(false);
  const [tierId, setTierId] = useState<string | null>(
    (pkg.tiers.find((tier) => tier.isDefault) ?? pkg.tiers[0])?.id ?? null,
  );
  const [roomRequests, setRoomRequests] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [tripMessages, setTripMessages] = useState(false);
  const [certifications, setCertifications] = useState<
    Record<string, CertificationDraft>
  >({});
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; bookingCode: string } | null>(null);

  const money = (value: number | string) =>
    plainSpaces(formatMoney(value, pkg.currency, locale));

  const departure = departures.find((candidate) => candidate.id === departureId) ?? null;
  const travelDate = departure ? new Date(departure.startDate) : null;
  const tier = pkg.tiers.find((candidate) => candidate.id === tierId) ?? null;
  const startPrice = Number(departure?.price ?? pkg.basePrice);
  const capacity = Math.min(departure?.capacity ?? MAX_PARTY, MAX_PARTY);
  const offeredExtras = pkg.extras.filter((extra) => extra.active);

  const slots: Slot[] = KINDS.flatMap((kind) =>
    drafts[kind].map((draft, index) => ({ kind, index, draft })),
  );
  const count = (kind: TravelerKind) => drafts[kind].length;
  const keyOf = (slot: Slot) => `${slot.kind}-${slot.index}`;

  // Kinds and ages as the API will read them: from a date of birth once one is
  // in, else from the counters (a child at the first child age, an infant at 0).
  const party = slots.map((slot) => {
    const born = birthDate(slot.draft.dateOfBirth, today);
    if (born && travelDate) {
      return { kind: travelerKindOn(born, travelDate), age: ageOn(born, travelDate) };
    }
    return {
      kind: slot.kind,
      age: slot.kind === 'CHILD' ? INFANT_UNDER_AGE : slot.kind === 'INFANT' ? 0 : null,
    };
  });
  const rooms = planRooms(
    party.map((traveler) => traveler.kind),
    rooming,
  );
  const sleepers = slots.filter((slot) => slot.kind !== 'INFANT').length;
  const chosenExtras = offeredExtras.filter((extra) => extras.includes(extra.id));
  const price: BookingPrice | null = departure
    ? priceBooking({
        packageName: pkg.name,
        basePrice: Number(pkg.basePrice),
        departurePrice: departure.price === null ? null : Number(departure.price),
        tier: tier
          ? {
              name: tier.name,
              priceDelta: Number(tier.priceDelta),
              singleSupplement:
                tier.singleSupplement === null ? null : Number(tier.singleSupplement),
            }
          : null,
        travelers: party,
        childBands: pricing.childBands,
        singleRooms: rooms.singleRooms,
        extras: chosenExtras.map((extra) => ({
          label: extra.name,
          unit: extra.priceUnit,
          unitAmount: Number(extra.price),
          quantity: 1,
        })),
        fees: pricing.fees,
      })
    : null;
  const agesPending = slots.some(
    (slot) => slot.kind !== 'ADULT' && !birthDate(slot.draft.dateOfBirth, today),
  );

  const usSlots = slots
    .map((slot, position) => ({ slot, position }))
    .filter(({ slot }) => slot.draft.nationality === 'US' && legal.statement !== null);

  // Step 5 shows each distinct text once; ticking it grants every purpose it covers.
  const consentGroups = REQUIRED.reduce<
    { key: string; text: LegalText; purposes: ConsentPurpose[] }[]
  >((groups, purpose) => {
    const text = legal.consents[purpose];
    if (!text) {
      return groups;
    }
    const key = `${text.version}\u0000${text.text}`;
    const group = groups.find((candidate) => candidate.key === key);
    if (group) {
      group.purposes.push(purpose);
    } else {
      groups.push({ key, text, purposes: [purpose] });
    }
    return groups;
  }, []);
  const consentsReady =
    REQUIRED.every((purpose) => legal.consents[purpose]) &&
    consentGroups.every((group) => agreed[group.key]);

  function go(next: Step) {
    setStep(next);
    setShowErrors(false);
    setError(null);
    window.scrollTo({ top: 0 });
    // Move focus to the step's heading so a screen reader hears where it is.
    requestAnimationFrame(() => heading.current?.focus());
  }

  function setCount(kind: TravelerKind, value: number) {
    setDrafts((current) => ({
      ...current,
      [kind]: resize(current[kind], value, emptyDraft),
    }));
  }

  function updateDraft(slot: Slot, patch: Partial<TravelerDraft>) {
    setDrafts((current) => ({
      ...current,
      [slot.kind]: current[slot.kind].map((draft, index) =>
        index === slot.index ? { ...draft, ...patch } : draft,
      ),
    }));
  }

  function certification(slot: Slot): CertificationDraft {
    return (
      certifications[keyOf(slot)] ?? {
        category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE',
        signature: '',
      }
    );
  }

  /** Step 4's field errors, keyed `<slot>.<field>`. */
  function travelerErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    slots.forEach((slot, position) => {
      const key = keyOf(slot);
      const { draft } = slot;
      if (!draft.firstNames.trim())
        errors[`${key}.firstNames`] = t('travelers.errors.required');
      if (!draft.lastName.trim())
        errors[`${key}.lastName`] = t('travelers.errors.required');
      if (!draft.nationality)
        errors[`${key}.nationality`] = t('travelers.errors.required');
      const born = birthDate(draft.dateOfBirth, today);
      if (!born) {
        errors[`${key}.dateOfBirth`] = draft.dateOfBirth
          ? t('travelers.errors.dob')
          : t('travelers.errors.required');
      } else if (travelDate && travelerKindOn(born, travelDate) !== slot.kind) {
        errors[`${key}.dateOfBirth`] = t('travelers.errors.kind', {
          age: ageOn(born, travelDate),
          kind: t(`travelers.kindRule.${slot.kind}`),
        });
      }
      const passport = normalisePassport(draft.passportNumber);
      if (passport && !/^[A-Z0-9]{5,20}$/.test(passport)) {
        errors[`${key}.passport`] = t('travelers.errors.passport');
      }
      if (position === 0) {
        if (!phone.trim()) errors.phone = t('travelers.errors.required');
        if (!emergencyName.trim()) errors.emergencyName = t('travelers.errors.required');
        if (!emergencyPhone.trim())
          errors.emergencyPhone = t('travelers.errors.required');
      }
    });
    for (const { slot } of usSlots) {
      const name = fullName(slot.draft);
      if (!signatureMatches(certification(slot).signature, name)) {
        errors[`${keyOf(slot)}.signature`] = t('travelers.errors.signature', { name });
      }
    }
    return errors;
  }

  const errors = showErrors ? travelerErrors() : {};
  const certificationPending = usSlots.some(
    ({ slot }) => !signatureMatches(certification(slot).signature, fullName(slot.draft)),
  );

  async function submit() {
    if (!departure || !price) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/ota/me/reservations/package-booking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          departureId: departure.id,
          tierId,
          rooming,
          roommateMatch,
          travelers: slots.map(({ draft }) => ({
            fullName: fullName(draft),
            dateOfBirth: draft.dateOfBirth,
            nationality: draft.nationality,
            ...(draft.passportNumber.trim()
              ? { passportNumber: draft.passportNumber.trim() }
              : {}),
          })),
          phone: phone.trim(),
          emergencyContactName: emergencyName.trim(),
          emergencyContactPhone: emergencyPhone.trim(),
          extras: chosenExtras.map((extra) => ({
            packageExtraId: extra.id,
            quantity: 1,
          })),
          roomRequests: roomRequests.trim() || undefined,
          notes: notes.trim() || undefined,
          affidavits: usSlots.map(({ slot, position }) => ({
            traveler: position,
            category: certification(slot).category,
            signature: certification(slot).signature.trim(),
          })),
          statementVersion: usSlots.length > 0 ? legal.statement?.version : undefined,
          consents: [
            ...REQUIRED.map((purpose) => ({
              purpose,
              textVersion: legal.consents[purpose]!.version,
            })),
            ...(tripMessages && legal.consents.TRIP_MESSAGES
              ? [
                  {
                    purpose: 'TRIP_MESSAGES',
                    textVersion: legal.consents.TRIP_MESSAGES.version,
                  },
                ]
              : []),
          ],
          locale,
          expectedTotal: price.total,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        throw new Error(
          typeof body?.message === 'string' ? body.message : t('review.failed'),
        );
      }
      const booking = (await response.json()) as { id: string; bookingCode: string };
      setSent({ id: booking.id, bookingCode: booking.bookingCode });
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => heading.current?.focus());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('review.failed'));
    } finally {
      setBusy(false);
    }
  }

  const titleClass = 'text-h2-compact text-default focus:outline-none md:text-h2';
  const panel = 'flex min-w-0 flex-col gap-6 rounded-lg border bg-surface p-5 md:p-7';
  const footer =
    'flex flex-wrap items-center justify-between gap-3 border-t pt-4 [&>*:last-child]:ml-auto';

  if (sent) {
    const leadFirst = slots[0]?.draft.firstNames.trim().split(/\s+/)[0] ?? '';
    const timeline = [
      { key: 'received', done: true },
      { key: 'confirming', done: false },
      { key: 'ready', done: false },
      { key: 'confirmed', done: false },
    ] as const;
    return (
      <section className={cn(panel, 'mx-auto w-full max-w-[640px]')}>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100 text-success-700">
          <Icon name="check" className="h-6 w-6" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 ref={heading} tabIndex={-1} className={titleClass}>
            {t('sent.title')}
          </h1>
          <p className="text-body text-secondary">
            {t('sent.lede', { name: leadFirst })}
          </p>
          <p className="text-body text-secondary">
            {t('sent.code')}:{' '}
            <span className="font-mono font-semibold text-default">
              {sent.bookingCode}
            </span>
            . {t('sent.nothing')}
          </p>
          <p className="text-body-sm text-muted">{t('sent.emailed')}</p>
        </div>
        <ol className="flex flex-col gap-3">
          {timeline.map((entry) => (
            <li key={entry.key} className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  entry.done
                    ? 'border-primary-600 bg-primary-600 text-on-primary'
                    : 'border-input bg-surface',
                )}
              >
                {entry.done ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="flex flex-col">
                <span className="text-body font-medium text-default">
                  {t(`sent.timeline.${entry.key}`)}
                </span>
                <span className="text-body-sm text-muted">
                  {t(`sent.timeline.${entry.key}Hint`)}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="border-t pt-4">
          <Link
            href={`/account/reservations/${sent.id}`}
            className={buttonClassName({ size: 'lg' })}
          >
            {t('sent.open')}
          </Link>
        </div>
      </section>
    );
  }

  const stepper = (
    <Stepper
      className="mx-auto w-full max-w-[760px]"
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
  );

  const stepHead = (title: string, lede?: string) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-overline uppercase text-primary-600">
        {t('stepOf', { step, total: STEP_IDS.length })}
      </p>
      <h1 ref={heading} tabIndex={-1} className={titleClass}>
        {title}
      </h1>
      {lede ? <p className="text-body text-secondary">{lede}</p> : null}
    </div>
  );

  const back = (target: Step) => (
    <Button type="button" variant="tertiary" onClick={() => go(target)}>
      <Icon name="arrow-left" />
      {t('back')}
    </Button>
  );

  let content: ReactNode;
  if (step === 1) {
    content = (
      <div className={panel}>
        {stepHead(t('departure.title'), t('departure.lede', { name: pkg.name, length }))}
        {departures.length === 0 ? (
          <Alert variant="info">{t('departure.none')}</Alert>
        ) : (
          <Field
            id="booking-departure"
            label={t('departure.label')}
            hint={t('departure.capacity', { count: capacity })}
          >
            {(control) => (
              <Select
                {...control}
                className="max-w-[420px]"
                value={departureId}
                onChange={(event) => setDepartureId(event.target.value)}
              >
                {departures.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t('departure.option', {
                      date: option.label,
                      price: option.priceLabel,
                    })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-body-sm font-medium text-default">
            {t('party.legend')}
          </legend>
          <div className="flex flex-col divide-y">
            {KINDS.map((kind) => {
              const words = COUNTER_KEYS[kind];
              return (
                <Counter
                  key={kind}
                  label={t(`party.${words.plural}`)}
                  description={t(`party.${words.plural}Hint`)}
                  value={count(kind)}
                  min={kind === 'ADULT' ? 1 : 0}
                  max={capacity - (slots.length - count(kind))}
                  onValueChange={(value) => setCount(kind, value)}
                  decrementLabel={t(`party.remove${words.one}`)}
                  incrementLabel={t(`party.add${words.one}`)}
                />
              );
            })}
          </div>
          {pricing.childBands.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-0.5 text-caption text-muted">
              {pricing.childBands.map((band) => (
                <li key={band.maxAge}>
                  {band.rate === 0
                    ? t('party.bandFree', { maxAge: band.maxAge })
                    : t('party.bandRate', {
                        maxAge: band.maxAge,
                        percent: Math.round(band.rate * 100),
                      })}
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
        <RadioGroup legend={t('rooms.legend')}>
          {sleepers > 1 ? (
            <Radio
              name="rooming"
              value="SHARE"
              checked={rooming === 'SHARE'}
              onChange={() => setRooming('SHARE')}
              label={t('rooms.share')}
              description={t('rooms.shareHint')}
            />
          ) : (
            <p className="py-2 text-body-sm text-secondary">{t('rooms.solo')}</p>
          )}
          {sleepers > 1 ? (
            <Radio
              name="rooming"
              value="PRIVATE"
              checked={rooming === 'PRIVATE'}
              onChange={() => setRooming('PRIVATE')}
              label={t('rooms.private')}
              description={
                tier?.singleSupplement
                  ? t('rooms.privateHint', { price: money(tier.singleSupplement) })
                  : t('rooms.privateFree')
              }
            />
          ) : null}
          {rooming === 'PRIVATE' || sleepers === 1 ? (
            <Checkbox
              className="pl-8"
              checked={roommateMatch}
              onChange={(event) => setRoommateMatch(event.target.checked)}
              label={t('rooms.roommate')}
            />
          ) : null}
        </RadioGroup>
        <div className={footer}>
          <Link
            href={`/packages/${pkg.slug}`}
            className={buttonClassName({ variant: 'tertiary' })}
          >
            <Icon name="arrow-left" />
            {t('backToTrip')}
          </Link>
          <Button type="button" size="lg" disabled={!departure} onClick={() => go(2)}>
            {t('departure.continue')}
          </Button>
        </div>
      </div>
    );
  } else if (step === 2) {
    content = (
      <div className={panel}>
        {stepHead(t('stay.title'), t('stay.lede'))}
        {pkg.tiers.length > 0 ? (
          <div
            role="radiogroup"
            aria-label={t('stay.legend')}
            className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]"
          >
            {pkg.tiers.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border bg-surface p-4 transition-colors hover:border-primary-600',
                  option.id === tierId && 'border-2 border-primary-600 bg-primary-50',
                )}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="tier"
                    value={option.id}
                    checked={option.id === tierId}
                    onChange={() => setTierId(option.id)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-primary-600"
                  />
                  <span className="text-body font-semibold text-default">
                    {option.name}
                  </span>
                </span>
                <span className="text-body-sm font-semibold text-primary-600">
                  {t('stay.perPerson', {
                    price: money(startPrice + Number(option.priceDelta)),
                  })}
                </span>
                {option.description ? (
                  <span className="text-body-sm text-secondary">
                    {option.description}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-body text-secondary">{t('stay.none')}</p>
        )}
        <Field
          id="booking-room-requests"
          label={t('stay.requests')}
          requirement={t('travelers.optional')}
          hint={t('stay.requestsHint')}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={1000}
              value={roomRequests}
              onChange={(event) => setRoomRequests(event.target.value)}
            />
          )}
        </Field>
        <div className={footer}>
          {back(1)}
          <Button type="button" size="lg" onClick={() => go(3)}>
            {t('stay.continue')}
          </Button>
        </div>
      </div>
    );
  } else if (step === 3) {
    content = (
      <div className={panel}>
        {stepHead(t('extras.title'), t('extras.lede'))}
        <section
          aria-labelledby="booking-insurance"
          className="flex flex-col gap-2 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="booking-insurance"
              className="text-body-lg font-semibold text-default"
            >
              {t('extras.insurance')}
            </h2>
            <Badge variant="warning">{t('extras.required')}</Badge>
          </div>
          <p className="text-body-sm text-secondary">{t('extras.insuranceText')}</p>
        </section>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-body-lg font-semibold text-default">
            {t('extras.legend')}
          </legend>
          {offeredExtras.length === 0 ? (
            <p className="text-body-sm text-secondary">{t('extras.none')}</p>
          ) : (
            offeredExtras.map((extra) => (
              <label
                key={extra.id}
                className={cn(
                  'flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 transition-colors hover:border-primary-600',
                  extras.includes(extra.id) &&
                    'border-2 border-primary-600 bg-primary-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={extras.includes(extra.id)}
                  onChange={(event) =>
                    setExtras((current) =>
                      event.target.checked
                        ? [...current, extra.id]
                        : current.filter((id) => id !== extra.id),
                    )
                  }
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary-600"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-body font-semibold text-default">
                      {extra.name}
                    </span>
                    <span className="text-body-sm font-semibold text-default">
                      {extra.priceUnit === 'PER_PERSON'
                        ? t('extras.perPerson', { price: money(extra.price) })
                        : t('extras.perBooking', { price: money(extra.price) })}
                    </span>
                  </span>
                  {extra.durationLabel || extra.dayOffset !== null ? (
                    <span className="text-caption text-muted">
                      {[
                        extra.dayOffset !== null
                          ? t('extras.day', { day: extra.dayOffset + 1 })
                          : null,
                        extra.durationLabel,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  ) : null}
                  {extra.description ? (
                    <span className="text-body-sm text-secondary">
                      {extra.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))
          )}
        </fieldset>
        {pkg.included.length > 0 ? (
          <section aria-labelledby="booking-included" className="flex flex-col gap-2">
            <h2 id="booking-included" className="text-body-lg font-semibold text-default">
              {t('extras.included')}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {pkg.included.map((item) => (
                <li key={item} className="flex gap-2 text-body-sm text-secondary">
                  <Icon name="check" className="mt-0.5 h-4 w-4 text-success-600" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-caption text-muted">{t('extras.firm')}</p>
        <div className={footer}>
          {back(2)}
          <Button type="button" size="lg" onClick={() => go(4)}>
            {t('extras.continue')}
          </Button>
        </div>
      </div>
    );
  } else if (step === 4) {
    content = (
      <div className={panel}>
        {stepHead(t('travelers.title'), t('travelers.lede'))}
        {slots.map((slot, position) => {
          const key = keyOf(slot);
          const id = (field: string) => `booking-${key}-${field}`;
          const lead = position === 0;
          const name = fullName(slot.draft);
          const us = usSlots.some((entry) => entry.position === position);
          return (
            <section
              key={key}
              aria-labelledby={id('title')}
              className="flex min-w-0 flex-col gap-4 rounded-lg border p-4 md:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={id('title')} className="text-body-lg font-semibold text-default">
                  {lead
                    ? t('travelers.lead')
                    : t('travelers.heading', {
                        number: position + 1,
                        kind: t(`travelers.kinds.${slot.kind}`),
                      })}
                </h2>
                {lead ? (
                  <Badge variant="secondary">{t('travelers.leadPill')}</Badge>
                ) : null}
              </div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
                <Field
                  id={id('first')}
                  label={t('travelers.firstNames')}
                  error={errors[`${key}.firstNames`]}
                  required
                >
                  {(control) => (
                    <Input
                      {...control}
                      autoComplete={lead ? 'given-name' : 'off'}
                      maxLength={120}
                      value={slot.draft.firstNames}
                      onChange={(event) =>
                        updateDraft(slot, { firstNames: event.target.value })
                      }
                    />
                  )}
                </Field>
                <Field
                  id={id('last')}
                  label={t('travelers.lastName')}
                  error={errors[`${key}.lastName`]}
                  required
                >
                  {(control) => (
                    <Input
                      {...control}
                      autoComplete={lead ? 'family-name' : 'off'}
                      maxLength={80}
                      value={slot.draft.lastName}
                      onChange={(event) =>
                        updateDraft(slot, { lastName: event.target.value })
                      }
                    />
                  )}
                </Field>
                <Field
                  id={id('dob')}
                  label={t('travelers.dateOfBirth')}
                  error={errors[`${key}.dateOfBirth`]}
                  required
                >
                  {(control) => (
                    <Input
                      {...control}
                      type="date"
                      max={today}
                      autoComplete={lead ? 'bday' : 'off'}
                      value={slot.draft.dateOfBirth}
                      onChange={(event) =>
                        updateDraft(slot, { dateOfBirth: event.target.value })
                      }
                    />
                  )}
                </Field>
                <Field
                  id={id('nationality')}
                  label={t('travelers.nationality')}
                  error={errors[`${key}.nationality`]}
                  required
                >
                  {(control) => (
                    <Select
                      {...control}
                      value={slot.draft.nationality}
                      onChange={(event) =>
                        updateDraft(slot, { nationality: event.target.value })
                      }
                    >
                      <option value="">{t('travelers.choose')}</option>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  id={id('passport')}
                  label={t('travelers.passport')}
                  requirement={t('travelers.optionalNow')}
                  error={errors[`${key}.passport`]}
                >
                  {(control) => (
                    <Input
                      {...control}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={30}
                      value={slot.draft.passportNumber}
                      onChange={(event) =>
                        updateDraft(slot, { passportNumber: event.target.value })
                      }
                    />
                  )}
                </Field>
                {lead ? (
                  <>
                    <Field
                      id={id('email')}
                      label={t('travelers.email')}
                      hint={t('travelers.emailHint')}
                    >
                      {(control) => (
                        <Input {...control} type="email" value={email} readOnly />
                      )}
                    </Field>
                    <Field
                      id={id('phone')}
                      label={t('travelers.phone')}
                      hint={t('travelers.phoneHint')}
                      error={errors.phone}
                      required
                    >
                      {(control) => (
                        <Input
                          {...control}
                          type="tel"
                          autoComplete="tel"
                          maxLength={40}
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                        />
                      )}
                    </Field>
                    <Field
                      id={id('emergency-name')}
                      label={t('travelers.emergencyName')}
                      error={errors.emergencyName}
                      required
                    >
                      {(control) => (
                        <Input
                          {...control}
                          autoComplete="off"
                          maxLength={200}
                          value={emergencyName}
                          onChange={(event) => setEmergencyName(event.target.value)}
                        />
                      )}
                    </Field>
                    <Field
                      id={id('emergency-phone')}
                      label={t('travelers.emergencyPhone')}
                      error={errors.emergencyPhone}
                      required
                    >
                      {(control) => (
                        <Input
                          {...control}
                          type="tel"
                          autoComplete="off"
                          maxLength={40}
                          value={emergencyPhone}
                          onChange={(event) => setEmergencyPhone(event.target.value)}
                        />
                      )}
                    </Field>
                  </>
                ) : null}
              </div>
              {us && legal.statement ? (
                <div className="flex flex-col gap-3 rounded-md border-l-[3px] border-accent-500 bg-accent-50 p-4">
                  <h3 className="text-body font-semibold text-default">
                    {tofac('title')}
                  </h3>
                  <p className="text-body-sm text-secondary">{tofac('lede')}</p>
                  <Field id={id('category')} label={tofac('category')}>
                    {(control) => (
                      <Select
                        {...control}
                        value={certification(slot).category}
                        onChange={(event) =>
                          setCertifications((current) => ({
                            ...current,
                            [key]: {
                              ...certification(slot),
                              category: event.target.value as OfacCategory,
                            },
                          }))
                        }
                      >
                        {OFAC_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {categories(category)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <figure className="flex flex-col gap-1">
                    <figcaption className="text-caption font-semibold uppercase text-muted">
                      {tofac('statement')}
                    </figcaption>
                    <blockquote className="border-l-[3px] border-primary-600 pl-3 text-body-sm text-default">
                      {legal.statement.text}
                    </blockquote>
                  </figure>
                  <Field
                    id={id('signature')}
                    label={tofac('signature', {
                      name: name || t('travelers.kinds.ADULT'),
                    })}
                    hint={tofac('signatureHint', { name })}
                    error={errors[`${key}.signature`]}
                    required
                  >
                    {(control) => (
                      <Input
                        {...control}
                        autoComplete="off"
                        maxLength={200}
                        value={certification(slot).signature}
                        onChange={(event) =>
                          setCertifications((current) => ({
                            ...current,
                            [key]: {
                              ...certification(slot),
                              signature: event.target.value,
                            },
                          }))
                        }
                      />
                    )}
                  </Field>
                  <p className="text-caption text-muted">{tofac('locked')}</p>
                </div>
              ) : null}
            </section>
          );
        })}
        <Field
          id="booking-notes"
          label={t('travelers.notes')}
          requirement={t('travelers.optional')}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
        </Field>
        {legal.consents.TRIP_MESSAGES ? (
          <Checkbox
            checked={tripMessages}
            onChange={(event) => setTripMessages(event.target.checked)}
            label={legal.consents.TRIP_MESSAGES.text}
          />
        ) : null}
        {showErrors && Object.keys(errors).length > 0 ? (
          <Alert variant="destructive">{t('travelers.fix')}</Alert>
        ) : certificationPending ? (
          <p className="text-body-sm text-muted">{t('travelers.certify')}</p>
        ) : null}
        <div className={footer}>
          {back(3)}
          <Button
            type="button"
            size="lg"
            onClick={() => {
              if (Object.keys(travelerErrors()).length > 0) {
                setShowErrors(true);
                return;
              }
              go(5);
            }}
          >
            {t('travelers.continue')}
          </Button>
        </div>
      </div>
    );
  } else {
    const summaryRow = (title: string, target: Step, body: ReactNode) => (
      <section className="flex min-w-0 flex-col gap-1 border-b pb-4 last:border-b-0 last:pb-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-overline uppercase text-muted">{title}</h2>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            aria-label={t('review.editLabel', { section: title })}
            onClick={() => go(target)}
          >
            {t('review.edit')}
          </Button>
        </div>
        {body}
      </section>
    );
    content = (
      <div className={panel}>
        {stepHead(t('review.title'), t('review.lede'))}
        <div className="flex flex-col gap-4 rounded-lg border p-4 md:p-5">
          {summaryRow(
            t('review.trip'),
            1,
            <>
              <p className="text-body font-semibold text-default">{pkg.name}</p>
              <p className="text-body-sm text-secondary">
                {departure?.label} · {length}
              </p>
              <p className="text-body-sm text-secondary">
                {t('summary.party', {
                  adults: count('ADULT'),
                  children: count('CHILD'),
                  infants: count('INFANT'),
                })}{' '}
                · {t('summary.rooms', { count: rooms.rooms.length })}
              </p>
            </>,
          )}
          {summaryRow(
            t('review.stay'),
            2,
            <p className="text-body text-default">{tier?.name ?? t('stay.none')}</p>,
          )}
          {summaryRow(
            t('review.extras'),
            3,
            <>
              <p className="text-body text-default">{t('review.insuranceOwn')}</p>
              <p className="text-body-sm text-secondary">
                {chosenExtras.length > 0
                  ? chosenExtras.map((extra) => extra.name).join(' · ')
                  : t('review.noExtras')}
              </p>
            </>,
          )}
          {summaryRow(
            t('review.travelers'),
            4,
            <>
              <ul className="flex flex-col">
                {slots.map((slot, position) => (
                  <li key={keyOf(slot)} className="text-body text-default">
                    {fullName(slot.draft)}
                    {position === 0 ? ` · ${t('review.lead')}` : ''}
                  </li>
                ))}
              </ul>
              <p className="break-words text-body-sm text-secondary">
                {email} · {phone}
              </p>
              {usSlots.length > 0 ? (
                <p className="flex items-center gap-1.5 text-body-sm text-success-700">
                  <Icon name="check" className="h-4 w-4" />
                  {t('review.certified')}
                </p>
              ) : null}
            </>,
          )}
        </div>
        <section aria-labelledby="booking-next" className="flex flex-col gap-2">
          <h2 id="booking-next" className="text-body-lg font-semibold text-default">
            {t('review.nextTitle')}
          </h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-secondary">
            <li>{t('review.next1')}</li>
            <li>{t('review.next2')}</li>
            <li>{t('review.next3')}</li>
          </ol>
        </section>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-body-lg font-semibold text-default">
            {t('review.consentsTitle')}
          </legend>
          {consentGroups.map((group) => (
            <Checkbox
              key={group.key}
              checked={agreed[group.key] ?? false}
              onChange={(event) =>
                setAgreed((current) => ({
                  ...current,
                  [group.key]: event.target.checked,
                }))
              }
              label={group.text.text}
            />
          ))}
          <Link
            href="/legal/privacy"
            className="self-start text-body-sm text-primary-600 underline underline-offset-[3px]"
          >
            {t('review.privacy')}
          </Link>
        </fieldset>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div className={footer}>
          {back(4)}
          <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
            <Button
              type="button"
              size="lg"
              // On a phone the label wraps rather than push the page sideways.
              className="h-auto min-h-12 whitespace-normal py-2 text-center sm:h-12 sm:whitespace-nowrap sm:py-0"
              disabled={!consentsReady || !price}
              loading={busy}
              onClick={submit}
            >
              <Icon name="lock" />
              {busy ? t('review.submitting') : t('review.submit')}
            </Button>
            {!consentsReady ? (
              <span className="text-caption text-muted">{t('review.tickAll')}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const childTotal = price?.lines
    .filter((line) => line.kind === 'CHILD')
    .reduce((sum, line) => sum + line.amount, 0);
  const childCount = price?.lines.filter((line) => line.kind === 'CHILD').length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-center gap-1.5 text-body-sm text-secondary">
        <Icon name="lock" className="h-4 w-4" />
        {t('secure')}
      </p>
      {stepper}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        {content}
        <aside
          aria-label={t('summary.label')}
          className="flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-6 shadow-md lg:sticky lg:top-24"
        >
          <div className="flex flex-col gap-1">
            <p className="text-body font-semibold text-default">{pkg.name}</p>
            {departure ? (
              <p className="text-body-sm text-secondary">
                {departure.label} · {length}
              </p>
            ) : null}
            <p className="text-body-sm text-secondary">
              {t('summary.party', {
                adults: count('ADULT'),
                children: count('CHILD'),
                infants: count('INFANT'),
              })}{' '}
              · {t('summary.rooms', { count: rooms.rooms.length })}
            </p>
          </div>
          {price ? (
            <>
              <dl className="flex flex-col gap-2 border-t pt-4 text-body-sm">
                {price.lines.map((line, index) => {
                  if (line.kind === 'CHILD') {
                    return index ===
                      price.lines.findIndex((other) => other.kind === 'CHILD') ? (
                      <SummaryLine
                        key="children"
                        label={t('summary.children', { count: childCount })}
                        amount={money(childTotal ?? 0)}
                      />
                    ) : null;
                  }
                  const values = {
                    count: line.quantity,
                    price: money(line.unitAmount),
                    name: line.label,
                  };
                  const label =
                    line.kind === 'BASE'
                      ? t('summary.base', values)
                      : line.kind === 'TIER'
                        ? t('summary.tier', values)
                        : line.kind === 'SINGLE_SUPPLEMENT'
                          ? t('summary.supplement', values)
                          : line.quantity === 1
                            ? line.label
                            : t('summary.extra', values);
                  return (
                    <SummaryLine
                      key={`${line.kind}-${index}`}
                      label={label}
                      amount={money(line.amount)}
                    />
                  );
                })}
              </dl>
              <div className="flex items-baseline justify-between gap-3 border-t pt-4">
                <span className="text-body font-semibold text-default">
                  {t('summary.total')}
                </span>
                <span className="text-h4 text-default">{money(price.total)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-body-sm">
                <span className="text-secondary">{t('summary.payToday')}</span>
                <span className="font-semibold text-default">{money(0)}</span>
              </div>
            </>
          ) : (
            <p className="text-body-sm text-secondary">{t('summary.choose')}</p>
          )}
          {agesPending && childCount > 0 ? (
            <p className="text-caption text-muted">{t('summary.agesNote')}</p>
          ) : null}
          <p className="text-caption text-muted">
            {t('summary.note', { currency: pkg.currency })}
          </p>
          <p className="self-start rounded-full border border-primary-600 px-3 py-1 text-caption font-semibold text-primary-600">
            {t('summary.request')}
          </p>
        </aside>
      </div>
    </div>
  );
}

function SummaryLine({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-secondary">{label}</dt>
      <dd className="shrink-0 font-medium text-default">{amount}</dd>
    </div>
  );
}
