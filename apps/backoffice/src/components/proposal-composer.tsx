'use client';

import { PROPOSAL_LINE_KINDS, PROPOSAL_LINE_UNITS, cubaProvinceName } from '@ota/domain';
import type { ProposalRequestPayloadDto, ProposalVersionDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';
import { money } from '@/lib/ops-format';

export interface ComposerItem {
  id: string;
  name: string;
  type: string;
  province: string | null;
  basePrice: string;
  currency: string;
}

interface LineDraft {
  kind: (typeof PROPOSAL_LINE_KINDS)[number];
  unit: (typeof PROPOSAL_LINE_UNITS)[number];
  label: string;
  description: string;
  quantity: string;
  unitAmount: string;
  inventoryItemId?: string;
}

interface StopDraft {
  province: string;
  nights: string;
  accommodation: string;
}

/** A day's number is its position, so the list always reads 1, 2, 3… */
interface DayDraft {
  location: string;
  plan: string;
  with: string;
}

interface OptionDraft {
  label: string;
  description: string;
  price: string;
}

/** The limits `proposalDocumentSchema` enforces on the server. */
const MAX_STOPS = 30;
const MAX_DAYS = 120;
const MAX_OPTIONS = 30;

function itemKind(type: string): LineDraft['kind'] {
  if (type === 'ACCOMMODATION') return 'LODGING';
  if (type === 'TRANSPORT') return 'TRANSPORT';
  return 'ACTIVITIES';
}

function initialLines(
  payload: ProposalRequestPayloadDto,
  items: ComposerItem[],
  current: ProposalVersionDto | undefined,
): LineDraft[] {
  if (current) {
    return current.lines.map((line) => ({
      kind: line.kind,
      unit: line.unit,
      label: line.label,
      description: line.description ?? '',
      quantity: String(Number(line.quantity)),
      unitAmount: String(Number(line.unitAmount)),
      ...(line.inventoryItemId ? { inventoryItemId: line.inventoryItemId } : {}),
    }));
  }
  const chosen = items.filter((item) => payload.inventoryItemIds.includes(item.id));
  if (chosen.length > 0) {
    return chosen.map((item) => ({
      kind: itemKind(item.type),
      unit: 'PER_BOOKING',
      label: item.name,
      description: item.province ?? '',
      quantity: '1',
      unitAmount: String(Number(item.basePrice)),
      inventoryItemId: item.id,
    }));
  }
  return [
    {
      kind: 'OTHER',
      unit: 'PER_BOOKING',
      label: '',
      description: '',
      quantity: '1',
      unitAmount: '0',
    },
  ];
}

/**
 * M5: the desk turns a custom request into a priced proposal version: the
 * summary, the route's stops, the day-by-day plan, the options the traveler
 * can add and the price lines. The server snapshots the terms, computes the
 * total from the lines, sends the email and marks the proposal SENT; a
 * revision is another version, and the composer starts from the current one
 * (or, for the first, from the traveler's route).
 */
export function ProposalComposer({
  proposalId,
  payload,
  items,
  current,
}: {
  proposalId: string;
  payload: ProposalRequestPayloadDto;
  items: ComposerItem[];
  current: ProposalVersionDto | undefined;
}) {
  const t = useTranslations('proposalsDesk');
  const tb = useTranslations('build');
  const locale = useLocale();
  const router = useRouter();
  const [summary, setSummary] = useState(
    current?.document.summary ??
      `${payload.adults} adults, ${payload.children} children · ${payload.startDate.slice(
        0,
        10,
      )} → ${payload.endDate.slice(0, 10)}`,
  );
  const [validUntil, setValidUntil] = useState(
    current ? current.validUntil.slice(0, 10) : '',
  );
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initialLines(payload, items, current),
  );
  // A first version starts from the traveler's route and stay styles.
  const [stops, setStops] = useState<StopDraft[]>(() =>
    current
      ? current.document.stops.map((stop) => ({
          province: stop.province,
          nights: String(stop.nights),
          accommodation: stop.accommodation ?? '',
        }))
      : payload.route.map((stop) => ({
          province: cubaProvinceName(stop.province),
          nights: String(stop.nights),
          accommodation: stop.stay ? tb(`stays.styles.${stop.stay}`) : '',
        })),
  );
  const [days, setDays] = useState<DayDraft[]>(() =>
    [...(current?.document.days ?? [])]
      .sort((a, b) => a.day - b.day)
      .map((day) => ({ location: day.location, plan: day.plan, with: day.with ?? '' })),
  );
  const [options, setOptions] = useState<OptionDraft[]>(
    () =>
      current?.document.options.map((option) => ({
        label: option.label,
        description: option.description ?? '',
        price: option.price === undefined ? '' : String(option.price),
      })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0),
    0,
  );
  const nightsValid = (value: string) =>
    /^\d+$/.test(value.trim()) && Number(value) <= 60;
  const valid =
    summary.trim().length > 0 &&
    lines.length > 0 &&
    lines.every((line) => line.label.trim().length > 0) &&
    stops.every((stop) => stop.province.trim().length > 0 && nightsValid(stop.nights)) &&
    days.every((day) => day.location.trim().length > 0 && day.plan.trim().length > 0) &&
    options.every(
      (option) =>
        option.label.trim().length > 0 &&
        (option.price.trim() === '' || Number(option.price) >= 0),
    );

  function update(index: number, patch: Partial<LineDraft>) {
    setLines((currentLines) =>
      currentLines.map((line, position) =>
        position === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function remove(index: number) {
    setLines((currentLines) => currentLines.filter((_, position) => position !== index));
  }

  /** Patch or drop one row of a list kept in state. */
  function patchAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
    return list.map((row, position) => (position === index ? { ...row, ...patch } : row));
  }
  function without<T>(list: T[], index: number): T[] {
    return list.filter((_, position) => position !== index);
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/proposals/${proposalId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          summary: summary.trim(),
          ...(validUntil ? { validUntil } : {}),
          stops: stops.map((stop) => ({
            province: stop.province.trim(),
            nights: Number(stop.nights),
            ...(stop.accommodation.trim()
              ? { accommodation: stop.accommodation.trim() }
              : {}),
          })),
          days: days.map((day, index) => ({
            day: index + 1,
            location: day.location.trim(),
            plan: day.plan.trim(),
            ...(day.with.trim() ? { with: day.with.trim() } : {}),
          })),
          options: options.map((option) => ({
            label: option.label.trim(),
            ...(option.description.trim()
              ? { description: option.description.trim() }
              : {}),
            ...(option.price.trim() ? { price: Number(option.price) } : {}),
          })),
          lines: lines.map((line) => ({
            kind: line.kind,
            unit: line.unit,
            label: line.label.trim(),
            ...(line.description.trim() ? { description: line.description.trim() } : {}),
            quantity: Number(line.quantity),
            unitAmount: Number(line.unitAmount),
            ...(line.inventoryItemId ? { inventoryItemId: line.inventoryItemId } : {}),
          })),
        }),
      });
      router.refresh();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="proposal-summary">{t('summary')}</Label>
        <Textarea
          id="proposal-summary"
          rows={4}
          value={summary}
          placeholder={t('summaryPlaceholder')}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="proposal-validity">{t('validity')}</Label>
          <Input
            id="proposal-validity"
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </div>
        <div className="flex items-end justify-end">
          <span className="text-body-sm text-muted">
            {t('total')}:{' '}
            <span className="font-mono font-semibold">{money(total, 'EUR', locale)}</span>
          </span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="px-1 text-body-sm font-semibold text-default">
          {t('route')}
        </legend>
        {stops.length === 0 ? (
          <p className="text-body-sm text-muted">{t('routeEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {stops.map((stop, index) => (
              <li
                key={index}
                className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.4fr)_auto]"
              >
                <Input
                  aria-label={t('stopProvince', { stop: index + 1 })}
                  placeholder={t('stopProvincePlaceholder')}
                  maxLength={80}
                  value={stop.province}
                  onChange={(event) =>
                    setStops((list) =>
                      patchAt(list, index, { province: event.target.value }),
                    )
                  }
                />
                <Input
                  aria-label={t('stopNights', { stop: index + 1 })}
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  value={stop.nights}
                  onChange={(event) =>
                    setStops((list) =>
                      patchAt(list, index, { nights: event.target.value }),
                    )
                  }
                />
                <Input
                  aria-label={t('stopStay', { stop: index + 1 })}
                  placeholder={t('stopStayPlaceholder')}
                  maxLength={200}
                  value={stop.accommodation}
                  onChange={(event) =>
                    setStops((list) =>
                      patchAt(list, index, { accommodation: event.target.value }),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  onClick={() => setStops((list) => without(list, index))}
                >
                  {t('remove')}
                </Button>
              </li>
            ))}
          </ol>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={stops.length >= MAX_STOPS}
          onClick={() =>
            setStops((list) => [
              ...list,
              { province: '', nights: '1', accommodation: '' },
            ])
          }
        >
          {t('addStop')}
        </Button>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="px-1 text-body-sm font-semibold text-default">
          {t('days')}
        </legend>
        {days.length === 0 ? (
          <p className="text-body-sm text-muted">{t('daysEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {days.map((day, index) => (
              <li
                key={index}
                className="grid items-start gap-2 md:grid-cols-[4rem_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]"
              >
                <span className="pt-2 text-body-sm font-semibold text-default">
                  {t('day', { day: index + 1 })}
                </span>
                <Input
                  aria-label={t('dayLocation', { day: index + 1 })}
                  placeholder={t('dayLocationPlaceholder')}
                  maxLength={120}
                  value={day.location}
                  onChange={(event) =>
                    setDays((list) =>
                      patchAt(list, index, { location: event.target.value }),
                    )
                  }
                />
                <Textarea
                  aria-label={t('dayPlan', { day: index + 1 })}
                  placeholder={t('dayPlanPlaceholder')}
                  rows={2}
                  maxLength={2000}
                  value={day.plan}
                  onChange={(event) =>
                    setDays((list) => patchAt(list, index, { plan: event.target.value }))
                  }
                />
                <Input
                  aria-label={t('dayWith', { day: index + 1 })}
                  placeholder={t('dayWithPlaceholder')}
                  maxLength={120}
                  value={day.with}
                  onChange={(event) =>
                    setDays((list) => patchAt(list, index, { with: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  onClick={() => setDays((list) => without(list, index))}
                >
                  {t('remove')}
                </Button>
              </li>
            ))}
          </ol>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={days.length >= MAX_DAYS}
          onClick={() =>
            setDays((list) => [...list, { location: '', plan: '', with: '' }])
          }
        >
          {t('addDay')}
        </Button>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="px-1 text-body-sm font-semibold text-default">
          {t('options')}
        </legend>
        {options.length === 0 ? (
          <p className="text-body-sm text-muted">{t('optionsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {options.map((option, index) => (
              <li
                key={index}
                className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem_auto]"
              >
                <Input
                  aria-label={t('optionLabel', { option: index + 1 })}
                  placeholder={t('optionLabelPlaceholder')}
                  maxLength={200}
                  value={option.label}
                  onChange={(event) =>
                    setOptions((list) =>
                      patchAt(list, index, { label: event.target.value }),
                    )
                  }
                />
                <Input
                  aria-label={t('optionDescription', { option: index + 1 })}
                  placeholder={t('optionDescriptionPlaceholder')}
                  maxLength={1000}
                  value={option.description}
                  onChange={(event) =>
                    setOptions((list) =>
                      patchAt(list, index, { description: event.target.value }),
                    )
                  }
                />
                <Input
                  aria-label={t('optionPrice', { option: index + 1 })}
                  type="number"
                  min={0}
                  step={0.01}
                  value={option.price}
                  onChange={(event) =>
                    setOptions((list) =>
                      patchAt(list, index, { price: event.target.value }),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  onClick={() => setOptions((list) => without(list, index))}
                >
                  {t('remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={options.length >= MAX_OPTIONS}
          onClick={() =>
            setOptions((list) => [...list, { label: '', description: '', price: '' }])
          }
        >
          {t('addOption')}
        </Button>
      </fieldset>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('kind')}</TableHead>
              <TableHead>{t('line')}</TableHead>
              <TableHead>{t('unit')}</TableHead>
              <TableHead className="text-right">{t('quantity')}</TableHead>
              <TableHead className="text-right">{t('unitAmount')}</TableHead>
              <TableHead className="text-right">{t('amount')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={`${line.inventoryItemId ?? 'line'}-${index}`}>
                <TableCell>
                  <Select
                    aria-label={t('kind')}
                    value={line.kind}
                    onChange={(event) =>
                      update(index, {
                        kind: event.target.value as LineDraft['kind'],
                      })
                    }
                  >
                    {PROPOSAL_LINE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`kinds.${kind}`)}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={t('line')}
                    value={line.label}
                    onChange={(event) => update(index, { label: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    aria-label={t('unit')}
                    value={line.unit}
                    onChange={(event) =>
                      update(index, {
                        unit: event.target.value as LineDraft['unit'],
                      })
                    }
                  >
                    {PROPOSAL_LINE_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {t(`units.${unit}`)}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    aria-label={t('quantity')}
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={line.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    aria-label={t('unitAmount')}
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.unitAmount}
                    onChange={(event) =>
                      update(index, { unitAmount: event.target.value })
                    }
                  />
                </TableCell>
                <TableCell className="text-right font-mono">
                  {money(
                    (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0),
                    'EUR',
                    locale,
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="sm"
                    variant="tertiary"
                    onClick={() => remove(index)}
                  >
                    {t('remove')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setLines((currentLines) => [
              ...currentLines,
              {
                kind: 'OTHER',
                unit: 'PER_BOOKING',
                label: '',
                description: '',
                quantity: '1',
                unitAmount: '0',
              },
            ])
          }
        >
          {t('addLine')}
        </Button>
        <Button type="button" disabled={!valid || busy} onClick={publish}>
          {busy ? t('publishing') : t('publish')}
        </Button>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
