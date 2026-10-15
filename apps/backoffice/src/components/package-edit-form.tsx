'use client';

import { packagePublishIssues } from '@ota/domain';
import type { InventoryItemDto, PackageDto, PackageStatusDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

interface ServiceRow {
  inventoryItemId: string;
  dayOffset: number;
}

interface TierRow {
  code: string;
  name: string;
  priceDelta: string;
  singleSupplement: string;
  isDefault: boolean;
}

interface DepartureRow {
  startDate: string;
  capacity: string;
  price: string;
}

interface ExtraRow {
  code: string;
  name: string;
  price: string;
  priceUnit: 'PER_PERSON' | 'PER_BOOKING';
}

interface DayRow {
  dayOffset: number;
  title: string;
  body: string;
}

function numberOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

/**
 * Edit a curated package on the M1 model (A-Package-Edit, spec §3.3): the
 * details, the itinerary, the accommodation tiers, the departures, the extras
 * and the day texts, saved in one PATCH. Publishing runs the domain publish
 * checks first. Media and per-locale text are edited elsewhere.
 */
export function PackageEditForm({
  package: pkg,
  items,
}: {
  package: PackageDto;
  items: InventoryItemDto[];
}) {
  const t = useTranslations('backoffice.packageEdit');
  const router = useRouter();

  const [name, setName] = useState(pkg.name);
  const [slug, setSlug] = useState(pkg.slug);
  const [summary, setSummary] = useState(pkg.summary ?? '');
  const [description, setDescription] = useState(pkg.description ?? '');
  const [province, setProvince] = useState(pkg.province ?? '');
  const [durationDays, setDurationDays] = useState(String(pkg.durationDays));
  const [currency, setCurrency] = useState(pkg.currency);
  const [basePrice, setBasePrice] = useState(pkg.basePrice);
  const [status, setStatus] = useState<PackageStatusDto>(pkg.status);
  const [bookingModel, setBookingModel] = useState(pkg.bookingModel);
  const [groupMin, setGroupMin] = useState(
    pkg.groupMin === null ? '' : String(pkg.groupMin),
  );
  const [groupMax, setGroupMax] = useState(
    pkg.groupMax === null ? '' : String(pkg.groupMax),
  );
  const [leadTimeDays, setLeadTimeDays] = useState(String(pkg.leadTimeDays));
  const [rows, setRows] = useState<ServiceRow[]>(
    [...pkg.services]
      .sort((a, b) => a.dayOffset - b.dayOffset || a.position - b.position)
      .map((service) => ({
        inventoryItemId: service.inventoryItemId,
        dayOffset: service.dayOffset,
      })),
  );
  const [tiers, setTiers] = useState<TierRow[]>(
    [...pkg.tiers]
      .sort((a, b) => a.position - b.position)
      .map((tier) => ({
        code: tier.code,
        name: tier.name,
        priceDelta: tier.priceDelta,
        singleSupplement: tier.singleSupplement ?? '',
        isDefault: tier.isDefault,
      })),
  );
  const [departures, setDepartures] = useState<DepartureRow[]>(
    pkg.departures.map((departure) => ({
      startDate: departure.startDate.slice(0, 10),
      capacity: String(departure.capacity),
      price: departure.price ?? '',
    })),
  );
  const [extras, setExtras] = useState<ExtraRow[]>(
    [...pkg.extras]
      .sort((a, b) => a.position - b.position)
      .map((extra) => ({
        code: extra.code,
        name: extra.name,
        price: extra.price,
        priceUnit: extra.priceUnit,
      })),
  );
  const [days, setDays] = useState<DayRow[]>(
    [...pkg.days]
      .sort((a, b) => a.dayOffset - b.dayOffset)
      .map((day) => ({
        dayOffset: day.dayOffset,
        title: day.title,
        body: day.body ?? '',
      })),
  );
  const [newItemId, setNewItemId] = useState(items[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemName = (id: string) => items.find((item) => item.id === id)?.name ?? id;

  function updateRow<T>(
    setter: (fn: (current: T[]) => T[]) => void,
    index: number,
    patch: Partial<T>,
  ) {
    setter((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    if (status === 'PUBLISHED') {
      const issues = packagePublishIssues({
        name,
        slug,
        serviceCount: rows.length,
        departureCount: departures.length,
        bookingModel,
        cancellationPolicy: pkg.cancellationPolicy,
        depositPolicy: pkg.depositPolicy,
        media: [],
        knownPolicyKeys: [pkg.cancellationPolicy, pkg.depositPolicy].filter(
          (key): key is string => key !== null,
        ),
      });
      if (issues.length > 0) {
        setError(t('publishIssues', { issues: issues.join(', ') }));
        setBusy(false);
        return;
      }
    }

    try {
      await apiRequest<PackageDto>(`/packages/${pkg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          slug,
          summary: summary || undefined,
          description: description || undefined,
          province: province || undefined,
          durationDays: Number(durationDays),
          currency,
          basePrice: Number(basePrice),
          status,
          bookingModel,
          groupMin: numberOrNull(groupMin),
          groupMax: numberOrNull(groupMax),
          leadTimeDays: Number(leadTimeDays),
          services: rows.map((row, index) => ({
            inventoryItemId: row.inventoryItemId,
            dayOffset: row.dayOffset,
            position: index,
          })),
          tiers: tiers.map((tier, index) => ({
            code: tier.code,
            name: tier.name,
            position: index,
            priceDelta: Number(tier.priceDelta) || 0,
            singleSupplement: numberOrNull(tier.singleSupplement),
            isDefault: tier.isDefault,
          })),
          departures: departures.map((departure) => ({
            startDate: departure.startDate,
            capacity: Number(departure.capacity),
            price: numberOrNull(departure.price),
          })),
          extras: extras.map((extra, index) => ({
            code: extra.code,
            name: extra.name,
            price: Number(extra.price),
            priceUnit: extra.priceUnit,
            position: index,
          })),
          days: days.map((day) => ({
            dayOffset: day.dayOffset,
            title: day.title,
            body: day.body || undefined,
          })),
        }),
      });
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('name')}</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">{t('slug')}</Label>
              <Input
                id="edit-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-summary">{t('summary')}</Label>
              <Input
                id="edit-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={400}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-description">{t('description')}</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-province">{t('province')}</Label>
              <Input
                id="edit-province"
                value={province}
                onChange={(event) => setProvince(event.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-days">{t('duration')}</Label>
              <Input
                id="edit-days"
                type="number"
                min="1"
                max="60"
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">{t('basePrice')}</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                value={basePrice}
                onChange={(event) => setBasePrice(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-currency">{t('currency')}</Label>
              <Input
                id="edit-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                maxLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">{t('status')}</Label>
              <Select
                id="edit-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as PackageStatusDto)}
              >
                {(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const).map(
                  (candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ),
                )}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-booking-model">{t('bookingModel')}</Label>
              <Select
                id="edit-booking-model"
                value={bookingModel}
                onChange={(event) =>
                  setBookingModel(event.target.value as PackageDto['bookingModel'])
                }
              >
                <option value="REQUEST">{t('requestModel')}</option>
                <option value="INSTANT">{t('instantModel')}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-min">{t('groupMin')}</Label>
              <Input
                id="edit-group-min"
                type="number"
                min="1"
                value={groupMin}
                onChange={(event) => setGroupMin(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-max">{t('groupMax')}</Label>
              <Input
                id="edit-group-max"
                type="number"
                min="1"
                value={groupMax}
                onChange={(event) => setGroupMax(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-time">{t('leadTime')}</Label>
              <Input
                id="edit-lead-time"
                type="number"
                min="0"
                max="365"
                value={leadTimeDays}
                onChange={(event) => setLeadTimeDays(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('itinerary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <Alert>{t('needsService')}</Alert>
          ) : (
            <ul className="space-y-2">
              {rows.map((row, index) => (
                <li
                  key={`${row.inventoryItemId}-${index}`}
                  className="flex items-center gap-3 rounded-md border p-2 text-body-sm"
                >
                  <span className="flex-1 font-medium">
                    {itemName(row.inventoryItemId)}
                  </span>
                  <label className="flex items-center gap-1 text-caption text-muted">
                    {t('day')}
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      className="h-8 w-16"
                      value={row.dayOffset + 1}
                      onChange={(event) =>
                        updateRow<ServiceRow>(setRows, index, {
                          dayOffset: Math.max(1, Number(event.target.value)) - 1,
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="tertiary"
                    onClick={() =>
                      setRows((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    {t('remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="edit-add-item">{t('addService')}</Label>
              <Select
                id="edit-add-item"
                value={newItemId}
                onChange={(event) => setNewItemId(event.target.value)}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                newItemId &&
                setRows((current) => [
                  ...current,
                  { inventoryItemId: newItemId, dayOffset: 0 },
                ])
              }
              disabled={!newItemId}
            >
              {t('add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('tiers')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tiers.map((tier, index) => (
            <div
              key={index}
              className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_auto_auto_auto_auto]"
            >
              <div className="space-y-1">
                <Label>{t('tierCode')}</Label>
                <Input
                  value={tier.code}
                  onChange={(event) =>
                    updateRow<TierRow>(setTiers, index, { code: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('tierName')}</Label>
                <Input
                  value={tier.name}
                  onChange={(event) =>
                    updateRow<TierRow>(setTiers, index, { name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('tierDelta')}</Label>
                <Input
                  type="number"
                  className="w-24"
                  value={tier.priceDelta}
                  onChange={(event) =>
                    updateRow<TierRow>(setTiers, index, {
                      priceDelta: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('tierSupplement')}</Label>
                <Input
                  type="number"
                  className="w-24"
                  value={tier.singleSupplement}
                  onChange={(event) =>
                    updateRow<TierRow>(setTiers, index, {
                      singleSupplement: event.target.value,
                    })
                  }
                />
              </div>
              <label className="flex items-center gap-1 pb-2 text-caption text-muted">
                <input
                  type="checkbox"
                  checked={tier.isDefault}
                  onChange={(event) =>
                    updateRow<TierRow>(setTiers, index, {
                      isDefault: event.target.checked,
                    })
                  }
                />
                {t('tierDefault')}
              </label>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                onClick={() =>
                  setTiers((current) => current.filter((_, i) => i !== index))
                }
              >
                {t('remove')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setTiers((current) => [
                ...current,
                {
                  code: '',
                  name: '',
                  priceDelta: '0',
                  singleSupplement: '',
                  isDefault: false,
                },
              ])
            }
          >
            {t('addTier')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('departures')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {departures.map((departure, index) => (
            <div
              key={index}
              className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[auto_auto_auto_auto]"
            >
              <div className="space-y-1">
                <Label>{t('departureDate')}</Label>
                <Input
                  type="date"
                  value={departure.startDate}
                  onChange={(event) =>
                    updateRow<DepartureRow>(setDepartures, index, {
                      startDate: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('departureSeats')}</Label>
                <Input
                  type="number"
                  min="1"
                  className="w-24"
                  value={departure.capacity}
                  onChange={(event) =>
                    updateRow<DepartureRow>(setDepartures, index, {
                      capacity: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('departurePrice')}</Label>
                <Input
                  type="number"
                  className="w-28"
                  value={departure.price}
                  onChange={(event) =>
                    updateRow<DepartureRow>(setDepartures, index, {
                      price: event.target.value,
                    })
                  }
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                onClick={() =>
                  setDepartures((current) => current.filter((_, i) => i !== index))
                }
              >
                {t('remove')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setDepartures((current) => [
                ...current,
                { startDate: '', capacity: '8', price: '' },
              ])
            }
          >
            {t('addDeparture')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('extras')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {extras.map((extra, index) => (
            <div
              key={index}
              className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
            >
              <div className="space-y-1">
                <Label>{t('extraCode')}</Label>
                <Input
                  value={extra.code}
                  onChange={(event) =>
                    updateRow<ExtraRow>(setExtras, index, { code: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('extraName')}</Label>
                <Input
                  value={extra.name}
                  onChange={(event) =>
                    updateRow<ExtraRow>(setExtras, index, { name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('extraPrice')}</Label>
                <Input
                  type="number"
                  className="w-24"
                  value={extra.price}
                  onChange={(event) =>
                    updateRow<ExtraRow>(setExtras, index, { price: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('extraUnit')}</Label>
                <Select
                  value={extra.priceUnit}
                  onChange={(event) =>
                    updateRow<ExtraRow>(setExtras, index, {
                      priceUnit: event.target.value as ExtraRow['priceUnit'],
                    })
                  }
                >
                  <option value="PER_PERSON">PER_PERSON</option>
                  <option value="PER_BOOKING">PER_BOOKING</option>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                onClick={() =>
                  setExtras((current) => current.filter((_, i) => i !== index))
                }
              >
                {t('remove')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setExtras((current) => [
                ...current,
                { code: '', name: '', price: '0', priceUnit: 'PER_PERSON' },
              ])
            }
          >
            {t('addExtra')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('daysSection')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {days.map((day, index) => (
            <div
              key={index}
              className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[auto_1fr_2fr_auto]"
            >
              <div className="space-y-1">
                <Label>{t('dayNumber')}</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  className="w-16"
                  value={day.dayOffset + 1}
                  onChange={(event) =>
                    updateRow<DayRow>(setDays, index, {
                      dayOffset: Math.max(1, Number(event.target.value)) - 1,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('dayTitle')}</Label>
                <Input
                  value={day.title}
                  onChange={(event) =>
                    updateRow<DayRow>(setDays, index, { title: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t('dayBody')}</Label>
                <Input
                  value={day.body}
                  onChange={(event) =>
                    updateRow<DayRow>(setDays, index, { body: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                onClick={() =>
                  setDays((current) => current.filter((_, i) => i !== index))
                }
              >
                {t('remove')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setDays((current) => [
                ...current,
                { dayOffset: current.length, title: '', body: '' },
              ])
            }
          >
            {t('addDay')}
          </Button>
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {saved ? <Alert>{t('saved')}</Alert> : null}

      <Button type="submit" disabled={busy || rows.length === 0}>
        {busy ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
