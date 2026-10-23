import type { OperatingThresholds } from '@ota/domain';

// Client-safe: the thresholds form and the server table share it.

export type ThresholdUnit =
  'min' | 'h' | 'pct' | 'eur' | 'days' | 'months' | 'count' | 'level';

export interface ThresholdField {
  key: keyof OperatingThresholds;
  unit: ThresholdUnit;
  min?: number;
  max?: number;
}

/** The thresholds in the board's groups; bounds match the API's schema. */
export const THRESHOLD_GROUPS: readonly {
  key: string;
  fields: readonly ThresholdField[];
}[] = [
  {
    key: 'dispatch',
    fields: [
      { key: 'dispatchTimeoutMinutes', unit: 'min', min: 15, max: 720 },
      { key: 'shortNoticeTimeoutMinutes', unit: 'min', min: 5, max: 240 },
      { key: 'shortNoticeWindowHours', unit: 'h', min: 1, max: 168 },
      { key: 'amberPercent', unit: 'pct', min: 50, max: 95 },
    ],
  },
  {
    key: 'suppliers',
    fields: [
      { key: 'credentialExpiryWindowDays', unit: 'days', min: 0, max: 120 },
      { key: 'reliabilityFloorPercent', unit: 'pct', min: 0, max: 100 },
      { key: 'reliabilityMinAnswered', unit: 'count', min: 1, max: 100 },
      { key: 'resourcesStaleDays', unit: 'days', min: 1, max: 60 },
    ],
  },
  {
    key: 'payments',
    fields: [
      { key: 'paymentWindowHours', unit: 'h', min: 1, max: 336 },
      { key: 'refundSingleUpTo', unit: 'eur', min: 0, max: 100_000 },
      { key: 'refundDualUpTo', unit: 'eur', min: 0, max: 100_000 },
    ],
  },
  {
    key: 'content',
    fields: [{ key: 'advisoryDualApprovalFrom', unit: 'level' }],
  },
  {
    key: 'customers',
    fields: [
      { key: 'retentionTriggerMonths', unit: 'months', min: 1, max: 24 },
      { key: 'retentionGraceDays', unit: 'days', min: 14, max: 90 },
    ],
  },
];

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * A threshold as the desk reads it ("120 min", "€ 500", "CRITICAL"). `units`
 * reads `backoffice.settings.thresholds.units`; `level` names a severity.
 */
export function thresholdText(
  field: ThresholdField,
  value: number | string,
  locale: string,
  units: Translate,
  level: Translate,
): string {
  if (field.unit === 'level') return level(String(value));
  if (field.unit === 'eur') {
    // Plain spaces: server and browser ICU differ on the space before "€".
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    })
      .format(Number(value))
      .replace(/[\u00a0\u2009\u202f]/g, ' ');
  }
  return units(field.unit, { value: Number(value) });
}

export const THRESHOLD_FIELDS: readonly ThresholdField[] = THRESHOLD_GROUPS.flatMap(
  (group) => group.fields,
);
