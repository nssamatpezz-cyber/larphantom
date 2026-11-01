import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './logic';
import { money, portfolioMoney } from './ui';

const precise = (value: number, currency = 'USD') => new Intl.NumberFormat(undefined, {
  style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 8,
}).format(value);

describe('portfolio balance display', () => {
  it('retains normal currency formatting for zero and balances of at least one cent', () => {
    for (const value of [0, .01, 1250.567, -25.5]) {
      expect(portfolioMoney(value, DEFAULT_SETTINGS)).toBe(money(value, DEFAULT_SETTINGS));
    }
  });

  it('keeps a nonzero sub-cent holding visible with up to eight decimal places', () => {
    expect(portfolioMoney(.00145999, DEFAULT_SETTINGS)).toBe(precise(.00145999));
    expect(portfolioMoney(-.00001234, DEFAULT_SETTINGS)).toBe(precise(-.00001234));
    expect(portfolioMoney(1e-8, DEFAULT_SETTINGS)).toBe(precise(1e-8));
  });

  it('bounds balances smaller than display precision without presenting them as zero', () => {
    expect(portfolioMoney(2e-10, DEFAULT_SETTINGS)).toBe(`<${precise(1e-8)}`);
    expect(portfolioMoney(-2e-10, DEFAULT_SETTINGS)).toBe(`−<${precise(1e-8)}`);
  });

  it('applies the selected currency conversion before choosing display precision', () => {
    const eur = { ...DEFAULT_SETTINGS, currency: 'EUR' as const, usdToEur: .5 };
    expect(portfolioMoney(.012, eur)).toBe(precise(.006, 'EUR'));
    const strongerEur = { ...eur, usdToEur: 2 };
    expect(portfolioMoney(.006, strongerEur)).toBe(money(.006, strongerEur));
  });
});
