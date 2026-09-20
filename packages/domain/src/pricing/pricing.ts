export const PricingRuleKind = {
  SeasonalRate: 'SEASONAL_RATE',
  Markup: 'MARKUP',
} as const;

export type PricingRuleKind = (typeof PricingRuleKind)[keyof typeof PricingRuleKind];

export interface PricingRule {
  kind: PricingRuleKind;
  label: string;
  active: boolean;
  /** Absolute nightly/unit price for a SEASONAL_RATE. */
  amount: number | null;
  /** Percentage added by a MARKUP. */
  percent: number | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface PriceBreakdown {
  /** The item's list price before any rule. */
  base: number;
  /** Effective base after an applicable seasonal override (equals base when none). */
  seasonal: number;
  /** Total markup amount. */
  markup: number;
  total: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isRuleActiveOn(rule: PricingRule, date: Date): boolean {
  if (!rule.active) {
    return false;
  }
  const at = date.getTime();
  if (rule.startDate && at < rule.startDate.getTime()) {
    return false;
  }
  if (rule.endDate && at > rule.endDate.getTime()) {
    return false;
  }
  return true;
}

/**
 * Price an inventory item for a given date:
 * seasonal override (latest matching start date wins), then summed markups on
 * top. All money is rounded to two decimals.
 */
export function calculatePrice(
  basePrice: number,
  date: Date,
  rules: readonly PricingRule[],
): PriceBreakdown {
  const seasonal = rules
    .filter(
      (rule) =>
        rule.kind === PricingRuleKind.SeasonalRate &&
        rule.amount !== null &&
        isRuleActiveOn(rule, date),
    )
    .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0))
    .at(-1);

  const effective = seasonal?.amount ?? basePrice;

  const markupPercent = rules
    .filter(
      (rule) =>
        rule.kind === PricingRuleKind.Markup &&
        rule.percent !== null &&
        isRuleActiveOn(rule, date),
    )
    .reduce((sum, rule) => sum + (rule.percent ?? 0), 0);

  const markup = round2((effective * markupPercent) / 100);

  return {
    base: round2(basePrice),
    seasonal: round2(effective),
    markup,
    total: round2(effective + markup),
  };
}
