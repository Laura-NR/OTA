'use client';

import { PROPOSAL_LINE_KINDS, PROPOSAL_LINE_UNITS } from '@ota/domain';
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
 * M5: the desk turns a custom request into a priced proposal version. The
 * server snapshots the terms, computes the total from the lines, sends the
 * email and marks the proposal SENT; a revision is another version.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0),
    0,
  );
  const valid =
    summary.trim().length > 0 &&
    lines.length > 0 &&
    lines.every((line) => line.label.trim().length > 0);

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

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/proposals/${proposalId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          summary: summary.trim(),
          ...(validUntil ? { validUntil } : {}),
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
