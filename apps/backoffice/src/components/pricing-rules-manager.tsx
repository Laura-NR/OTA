'use client';

import type { PricingRuleDto } from '@ota/schemas';
import { Alert, Badge, Button, Input, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Seasonal rates and agency markups for one catalog item (spec §4.6). */
export function PricingRulesManager({
  inventoryItemId,
  rules,
}: {
  inventoryItemId: string;
  rules: PricingRuleDto[];
}) {
  const t = useTranslations('backoffice.pricingRules');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'SEASONAL_RATE' | 'MARKUP'>('SEASONAL_RATE');

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);

    const startDate = form.get('startDate');
    const endDate = form.get('endDate');
    const payload: Record<string, unknown> = {
      kind: form.get('kind'),
      label: form.get('label'),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    if (form.get('kind') === 'SEASONAL_RATE') {
      payload.amount = Number(form.get('amount'));
    } else {
      payload.percent = Number(form.get('percent'));
    }

    try {
      await apiRequest(`/inventory/${inventoryItemId}/pricing-rules`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      formElement.reset();
      setKind('SEASONAL_RATE');
      router.refresh();
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : t('addFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(ruleId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/inventory/${inventoryItemId}/pricing-rules/${ruleId}`, {
        method: 'DELETE',
      });
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: PricingRuleDto) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/inventory/${inventoryItemId}/pricing-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rule.active }),
      });
      router.refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : t('updateFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {rules.length === 0 ? (
        <Alert>{t('none')}</Alert>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{rule.label}</span>
                  <Badge variant="secondary">{rule.kind.replaceAll('_', ' ')}</Badge>
                  <Badge variant={rule.active ? 'success' : 'outline'}>
                    {rule.active ? t('active') : t('paused')}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {rule.kind === 'SEASONAL_RATE'
                    ? `${rule.amount} · ${rule.startDate?.slice(0, 10) ?? t('any')} → ${
                        rule.endDate?.slice(0, 10) ?? t('any')
                      }`
                    : `${rule.percent}%`}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => toggle(rule)}
                >
                  {rule.active ? t('pause') : t('resume')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => remove(rule.id)}
                >
                  {t('delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="space-y-3 border-t pt-4" onSubmit={onAdd}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rule-kind">{t('kind')}</Label>
            <Select
              id="rule-kind"
              name="kind"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as 'SEASONAL_RATE' | 'MARKUP')
              }
            >
              <option value="SEASONAL_RATE">{t('seasonalRate')}</option>
              <option value="MARKUP">{t('markup')}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-label">{t('label')}</Label>
            <Input
              id="rule-label"
              name="label"
              required
              placeholder={t('labelPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-start">{t('startDate')}</Label>
            <Input id="rule-start" name="startDate" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-end">{t('endDate')}</Label>
            <Input id="rule-end" name="endDate" type="date" />
          </div>
          {kind === 'SEASONAL_RATE' ? (
            <div className="space-y-2">
              <Label htmlFor="rule-amount">{t('amount')}</Label>
              <Input
                id="rule-amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="rule-percent">{t('percentLabel')}</Label>
              <Input
                id="rule-percent"
                name="percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
              />
            </div>
          )}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? t('saving') : t('addRule')}
        </Button>
      </form>
    </div>
  );
}
