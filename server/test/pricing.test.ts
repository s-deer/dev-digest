import { describe, it, expect } from 'vitest';
import { estimateCost, hasPricing } from '../src/adapters/llm/pricing.js';

describe('estimateCost (per-provider/model pricing table)', () => {
  it('computes cost for a known model from its in/out token prices', () => {
    // deepseek/deepseek-v4-flash: in 0.14, out 0.28 per 1M tokens.
    expect(estimateCost('deepseek/deepseek-v4-flash', 1_000_000, 1_000_000)).toBe(0.42);
  });

  it('returns null for a model missing from the pricing table', () => {
    expect(estimateCost('mystery/model', 1000, 1000)).toBe(null);
  });

  it('rounds a mid-point value up instead of leaking float drift', () => {
    // The exact result is 0.3153605 — a tie at the 6th decimal place.
    // Plain `(tokensIn * p.in + tokensOut * p.out) / 1_000_000` represents it
    // as 0.31536049999999998805, so a naive `toFixed(6)` rounds down to
    // 0.315360; Decimal-based rounding sees the true tie and rounds up.
    expect(estimateCost('deepseek/deepseek-v4-flash', 423_995, 914_290)).toBe(0.315361);
  });
});

describe('hasPricing', () => {
  it('is true for a model present in the pricing table', () => {
    expect(hasPricing('deepseek/deepseek-v4-flash')).toBe(true);
  });

  it('is false for a model the pricing table does not know', () => {
    expect(hasPricing('mystery/model')).toBe(false);
  });
});
