import { describe, expect, it } from 'vitest';

import { PricingRuleKind, calculatePrice, isRuleActiveOn } from '../src';
import type { PricingRule } from '../src';

const WINTER = new Date('2026-12-15T00:00:00Z');
const SUMMER = new Date('2026-07-15T00:00:00Z');

function rule(overrides: Partial<PricingRule>): PricingRule {
  return {
    kind: PricingRuleKind.SeasonalRate,
    label: 'rule',
    active: true,
    amount: null,
    percent: null,
    startDate: null,
    endDate: null,
    ...overrides,
  };
}

describe('isRuleActiveOn', () => {
  it('respects the date window', () => {
    const winter = rule({ startDate: WINTER, endDate: WINTER });
    expect(isRuleActiveOn(winter, WINTER)).toBe(true);
    expect(isRuleActiveOn(winter, SUMMER)).toBe(false);
  });

  it('ignores inactive rules', () => {
    expect(isRuleActiveOn(rule({ active: false }), WINTER)).toBe(false);
  });
});

describe('calculatePrice', () => {
  it('returns the base price when no rules apply', () => {
    expect(calculatePrice(100, SUMMER, [])).toEqual({
      base: 100,
      seasonal: 100,
      markup: 0,
      total: 100,
    });
  });

  it('applies a matching seasonal override', () => {
    const rules = [rule({ amount: 180, startDate: WINTER, endDate: WINTER })];
    expect(calculatePrice(100, WINTER, rules).seasonal).toBe(180);
    expect(calculatePrice(100, SUMMER, rules).seasonal).toBe(100);
  });

  it('picks the latest matching seasonal rule', () => {
    const rules = [
      rule({ label: 'low', amount: 120, startDate: WINTER, endDate: WINTER }),
      rule({ label: 'high', amount: 250, startDate: WINTER, endDate: WINTER }),
    ];
    expect(calculatePrice(100, WINTER, rules).seasonal).toBe(250);
  });

  it('applies summed markups on top of the seasonal rate', () => {
    const rules = [
      rule({ amount: 200, startDate: WINTER, endDate: WINTER }),
      rule({ kind: PricingRuleKind.Markup, percent: 10, startDate: null }),
      rule({ kind: PricingRuleKind.Markup, percent: 5 }),
    ];
    const price = calculatePrice(100, WINTER, rules);
    expect(price.seasonal).toBe(200);
    expect(price.markup).toBe(30);
    expect(price.total).toBe(230);
  });

  it('ignores inactive rules and rules for other dates', () => {
    const rules = [
      rule({ amount: 999, startDate: WINTER, endDate: WINTER, active: false }),
      rule({
        kind: PricingRuleKind.Markup,
        percent: 50,
        startDate: SUMMER,
        endDate: SUMMER,
      }),
    ];
    expect(calculatePrice(100, WINTER, rules)).toEqual({
      base: 100,
      seasonal: 100,
      markup: 0,
      total: 100,
    });
  });
});
