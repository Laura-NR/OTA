'use client';

import type { VehicleDetailsDto } from '@ota/schemas';
import { Alert, Button, Checkbox, Field, Input, Textarea } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { calendarDate } from '@/lib/ops-format';

export interface SupplierVehicleFormProps {
  supplierId: string;
  vehicle: VehicleDetailsDto | null;
  /** Operations Admin and Super Admin save; support reads the fields. */
  canEdit: boolean;
}

/**
 * A driver's vehicle on the inspector (A-Suppliers "Vehicle & fuel", M6
 * D7(b)): model, seats, A/C, extras, plate, insurance cover and routes, saved
 * as one object. The insurance date is shown, not edited: it is the verified
 * insurance document's (`docs/schema-w-vehicle.md` X3a). The page keys this
 * form by the stored vehicle, so a refresh after saving resets it.
 */
export function SupplierVehicleForm({
  supplierId,
  vehicle,
  canEdit,
}: SupplierVehicleFormProps) {
  const t = useTranslations('backoffice.supplierDetail.vehicle');
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [seats, setSeats] = useState(vehicle ? String(vehicle.seats) : '');
  const [airConditioning, setAirConditioning] = useState(
    vehicle?.airConditioning ?? false,
  );
  const [extras, setExtras] = useState(vehicle?.extras ?? '');
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [insurance, setInsurance] = useState(vehicle?.insurance ?? '');
  const [routes, setRoutes] = useState((vehicle?.routes ?? []).join('\n'));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = !canEdit || pending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/vehicle`, {
        method: 'PUT',
        body: JSON.stringify({
          model,
          seats: Number(seats),
          airConditioning,
          extras: extras.trim() || null,
          plate,
          insurance: insurance.trim() || null,
          routes: routes
            .split('\n')
            .map((route) => route.trim())
            .filter(Boolean),
        }),
      });
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('failed'));
    } finally {
      setPending(false);
    }
  }

  const text = (
    name: string,
    label: string,
    value: string,
    onChange: (next: string) => void,
    options: { maxLength: number; required?: boolean; mono?: boolean },
  ) => (
    <Field id={`${id}-${name}`} label={label} required={options.required}>
      {(control) => (
        <Input
          {...control}
          maxLength={options.maxLength}
          className={options.mono ? 'font-mono' : undefined}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {text('model', t('model'), model, setModel, { maxLength: 80, required: true })}
        <Field id={`${id}-seats`} label={t('seats')} required>
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              className="font-mono"
              value={seats}
              disabled={disabled}
              onChange={(event) => setSeats(event.target.value)}
            />
          )}
        </Field>
        {text('plate', t('plate'), plate, setPlate, {
          maxLength: 20,
          required: true,
          mono: true,
        })}
        <div className="flex items-end">
          <Checkbox
            label={t('airConditioning')}
            checked={airConditioning}
            disabled={disabled}
            onChange={(event) => setAirConditioning(event.target.checked)}
          />
        </div>
        {text('extras', t('extras'), extras, setExtras, { maxLength: 120 })}
        {text('insurance', t('insurance'), insurance, setInsurance, { maxLength: 80 })}
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-default">
            {t('insuranceUntil')}
          </span>
          <p className="flex min-h-10 items-center font-mono text-body-sm text-default">
            {vehicle?.insuranceUntil
              ? calendarDate(vehicle.insuranceUntil, locale)
              : t('insuranceNone')}
          </p>
          <p className="text-caption text-muted">{t('insuranceFromDocument')}</p>
        </div>
      </div>
      <Field id={`${id}-routes`} label={t('routes')} hint={t('routesHint')}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={routes}
            disabled={disabled}
            onChange={(event) => setRoutes(event.target.value)}
          />
        )}
      </Field>
      {canEdit ? (
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </form>
  );
}
