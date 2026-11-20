import {
  DISPLAY_CURRENCIES,
  FEATURE_FLAGS,
  FX_SPREAD_PERCENT,
  displayCurrencySwitchKey,
  type IpAllowlistEntry,
  type OperatingThresholds,
} from '@ota/domain';

// Client-safe: the thresholds form and the server table share it.

export type ThresholdUnit =
  | 'min'
  | 'h'
  | 'pct'
  | 'eur'
  | 'days'
  | 'months'
  | 'count'
  | 'level'
  | 'switch'
  | 'lockPoint'
  | 'ipList';

export interface ThresholdField {
  key: keyof OperatingThresholds;
  unit: ThresholdUnit;
  min?: number;
  max?: number;
  /** The input's step; whole numbers when omitted. */
  step?: number;
}

/** The thresholds in the board's groups, then the flags; bounds match the API's schema. */
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
      { key: 'payoutBusinessDays', unit: 'days', min: 1, max: 30 },
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
    key: 'bookings',
    fields: [{ key: 'conciergeAnswerHours', unit: 'h', min: 1, max: 168 }],
  },
  {
    key: 'content',
    fields: [{ key: 'advisoryDualApprovalFrom', unit: 'level' }],
  },
  {
    // docs/schema-m9-display-currencies.md C2, C5, C6.
    key: 'currencies',
    fields: [
      ...DISPLAY_CURRENCIES.map((code) => ({
        key: displayCurrencySwitchKey(code),
        unit: 'switch' as const,
      })),
      {
        key: 'fxSpreadPercent',
        unit: 'pct',
        min: FX_SPREAD_PERCENT.min,
        max: FX_SPREAD_PERCENT.max,
        step: 0.1,
      },
      { key: 'fxLockAt', unit: 'lockPoint' },
    ],
  },
  {
    key: 'customers',
    fields: [
      { key: 'retentionTriggerMonths', unit: 'months', min: 1, max: 24 },
      { key: 'retentionGraceDays', unit: 'days', min: 14, max: 90 },
    ],
  },
  {
    key: 'security',
    fields: [
      { key: 'staffPasskeysRequired', unit: 'switch' },
      { key: 'staffIdleLockMinutes', unit: 'min', min: 5, max: 240 },
      { key: 'staffNewDeviceEmail', unit: 'switch' },
      // docs/schema-m9-ip-allowlist.md I5.
      { key: 'superAdminIpAllowlistOn', unit: 'switch' },
      { key: 'superAdminIpAllowlist', unit: 'ipList' },
      { key: 'overrideExpiryHours', unit: 'h', min: 1, max: 24 },
    ],
  },
  {
    // Runtime feature flags (M9 D8b); the default column is the manifest's.
    key: 'features',
    fields: FEATURE_FLAGS.map((key) => ({ key, unit: 'switch' as const })),
  },
];

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * A threshold as the desk reads it ("120 min", "€ 500", "CRITICAL", "On",
 * "Deposit payment", "Havana office · 203.0.113.0/24"). `units` reads
 * `backoffice.settings.thresholds.units`; `level` names a severity.
 */
export function thresholdText(
  field: ThresholdField,
  value: OperatingThresholds[keyof OperatingThresholds],
  locale: string,
  units: Translate,
  level: Translate,
): string {
  if (Array.isArray(value)) return ipListText(value, units);
  if (field.unit === 'level') return level(String(value));
  if (field.unit === 'switch') return units(value ? 'on' : 'off');
  if (field.unit === 'lockPoint') return units(String(value));
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

function ipListText(entries: readonly IpAllowlistEntry[], units: Translate): string {
  if (entries.length === 0) return units('none');
  return entries.map((entry) => `${entry.label} · ${entry.cidr}`).join(', ');
}

export const THRESHOLD_FIELDS: readonly ThresholdField[] = THRESHOLD_GROUPS.flatMap(
  (group) => group.fields,
);
