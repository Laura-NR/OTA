'use client';

import {
  DESK_RESOURCE_CHANNELS,
  GENERATOR_ACCESS,
  type GeneratorAccess,
} from '@ota/domain';
import type { SupplierResourcesDto } from '@ota/schemas';
import { Alert, Badge, Button, Field, Input, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

type Channel = (typeof DESK_RESOURCE_CHANNELS)[number];

export interface SupplierResourcesFormProps {
  supplierId: string;
  kind: 'casa' | 'driver';
  resources: SupplierResourcesDto | null;
  /** "on 20 Oct 2026 14:32", formatted on the server so the text hydrates. */
  confirmedWhen: string | null;
  /** Operations Admin and Super Admin confirm; support reads the fields (M6 D4). */
  canEdit: boolean;
}

const text = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

/** An empty field is "not given" (null); anything else is a number. */
const amount = (value: string): number | null =>
  value.trim() === '' ? null : Number(value);

/**
 * The inspector's A-Suppliers resources card: a casa's backup power, water and
 * capacity, or a driver's fuel reserve. Confirming replaces the whole row and
 * stamps the channel, the desk user and now (M6 D1, D2). The page keys this
 * form by the confirmation, so a refresh after saving resets it.
 */
export function SupplierResourcesForm({
  supplierId,
  kind,
  resources,
  confirmedWhen,
  canEdit,
}: SupplierResourcesFormProps) {
  const t = useTranslations('backoffice.supplierDetail.resources');
  const router = useRouter();
  const id = useId();
  const [generator, setGenerator] = useState<GeneratorAccess>(
    resources?.generator ?? 'NONE',
  );
  const [hours, setHours] = useState(text(resources?.generatorHoursPerDay));
  const [schedule, setSchedule] = useState(text(resources?.generatorSchedule));
  const [fuelDays, setFuelDays] = useState(text(resources?.generatorFuelDays));
  const [solar, setSolar] = useState(text(resources?.solarBatteryKwh));
  const [water, setWater] = useState(text(resources?.waterTankLitres));
  const [rooms, setRooms] = useState(text(resources?.rooms));
  const [guests, setGuests] = useState(text(resources?.guestCapacity));
  const [fuel, setFuel] = useState(text(resources?.fuelReserveLitres));
  const [via, setVia] = useState<Channel>('PHONE');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noGenerator = generator === 'NONE';
  const disabled = !canEdit || pending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body =
      kind === 'casa'
        ? {
            via,
            generator,
            generatorHoursPerDay: noGenerator ? null : amount(hours),
            generatorSchedule: noGenerator ? null : schedule.trim() || null,
            generatorFuelDays: noGenerator ? null : amount(fuelDays),
            solarBatteryKwh: amount(solar),
            waterTankLitres: amount(water),
            rooms: amount(rooms),
            guestCapacity: amount(guests),
          }
        : { via, fuelReserveLitres: amount(fuel) };
    try {
      await apiRequest(`/suppliers/${supplierId}/resources`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('failed'));
    } finally {
      setPending(false);
    }
  }

  const numberField = (
    name: string,
    label: string,
    value: string,
    onChange: (next: string) => void,
    options: { max?: number; step?: string; off?: boolean; hint?: string } = {},
  ) => (
    <Field id={`${id}-${name}`} label={label} hint={options.hint}>
      {(control) => (
        <Input
          {...control}
          type="number"
          inputMode={options.step ? 'decimal' : 'numeric'}
          min={0}
          max={options.max}
          step={options.step ?? '1'}
          className="font-mono"
          value={value}
          disabled={disabled || options.off}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {kind === 'casa' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field id={`${id}-generator`} label={t('generator')}>
            {(control) => (
              <Select
                {...control}
                value={generator}
                disabled={disabled}
                onChange={(event) => setGenerator(event.target.value as GeneratorAccess)}
              >
                {GENERATOR_ACCESS.map((option) => (
                  <option key={option} value={option}>
                    {t(`generatorOptions.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {numberField('hours', t('hours'), hours, setHours, {
            max: 24,
            off: noGenerator,
          })}
          <Field id={`${id}-schedule`} label={t('schedule')} hint={t('scheduleHint')}>
            {(control) => (
              <Input
                {...control}
                maxLength={60}
                value={schedule}
                disabled={disabled || noGenerator}
                onChange={(event) => setSchedule(event.target.value)}
              />
            )}
          </Field>
          {numberField('fuel-days', t('fuelDays'), fuelDays, setFuelDays, {
            off: noGenerator,
          })}
          {numberField('solar', t('solar'), solar, setSolar, {
            step: '0.1',
            max: 9999.9,
            hint: t('solarHint'),
          })}
          {numberField('water', t('water'), water, setWater)}
          {numberField('rooms', t('rooms'), rooms, setRooms)}
          {numberField('guests', t('guests'), guests, setGuests)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {numberField('fuel', t('fuel'), fuel, setFuel)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
        {resources ? (
          <span>
            {resources.confirmedByName
              ? t('confirmed', {
                  channel: t(`channels.${resources.confirmedVia}`),
                  when: confirmedWhen ?? '',
                  name: resources.confirmedByName,
                })
              : t('confirmedNoName', {
                  channel: t(`channels.${resources.confirmedVia}`),
                  when: confirmedWhen ?? '',
                })}
          </span>
        ) : (
          <span>{t('never')}</span>
        )}
        {resources?.stale ? <Badge variant="attention">{t('stale')}</Badge> : null}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field id={`${id}-via`} label={t('via')}>
            {(control) => (
              <Select
                {...control}
                value={via}
                disabled={pending}
                onChange={(event) => setVia(event.target.value as Channel)}
              >
                {DESK_RESOURCE_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {t(`channels.${channel}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? t('saving') : t('confirm')}
          </Button>
        </div>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <p className="text-caption text-muted">
        {kind === 'casa' ? t('casaNote') : t('driverNote')}
      </p>
    </form>
  );
}
