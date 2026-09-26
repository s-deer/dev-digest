/**
 * PR-list cost rollup (`modules/pulls/cost.ts`) — the COST column is the total
 * known spend over a PR's completed runs; unknown (null) costs are skipped and a
 * PR with no known cost is absent (→ the route emits null → UI "—").
 */
import { describe, it, expect } from 'vitest';
import { sumRunCosts } from '../src/modules/pulls/cost.js';

describe('sumRunCosts', () => {
  it('sums known costs per PR', () => {
    const totals = sumRunCosts([
      { prId: 'a', costUsd: 0.001 },
      { prId: 'a', costUsd: 0.0025 },
      { prId: 'b', costUsd: 0.01 },
    ]);
    expect(totals.get('a')).toBeCloseTo(0.0035);
    expect(totals.get('b')).toBeCloseTo(0.01);
  });

  it('skips null costs instead of nulling the whole PR', () => {
    const totals = sumRunCosts([
      { prId: 'a', costUsd: null },
      { prId: 'a', costUsd: 0.002 },
    ]);
    expect(totals.get('a')).toBeCloseTo(0.002);
  });

  it('leaves a PR with no known cost absent, and keeps a real zero', () => {
    const totals = sumRunCosts([
      { prId: 'a', costUsd: null },
      { prId: null, costUsd: 0.5 },
      { prId: 'free', costUsd: 0 },
    ]);
    expect(totals.has('a')).toBe(false);
    expect(totals.size).toBe(1);
    expect(totals.get('free')).toBe(0);
  });

  it('returns an empty map for no runs', () => {
    expect(sumRunCosts([]).size).toBe(0);
  });

  it('folds run costs and the Intent Layer cost together, including a PR with only an intent cost', () => {
    // Same {prId, costUsd} shape as `doneRunCostsForPulls` and
    // `intentRepo.costsForPulls` — the route concatenates both arrays.
    const totals = sumRunCosts([
      { prId: 'a', costUsd: 0.01 }, // agent run
      { prId: 'a', costUsd: 0.002 }, // pr_intent.cost_usd_total
      { prId: 'b', costUsd: null }, // agent run with unknown cost
      { prId: 'b', costUsd: 0.003 }, // pr_intent.cost_usd_total (only known cost)
    ]);
    expect(totals.get('a')).toBeCloseTo(0.012);
    expect(totals.get('b')).toBeCloseTo(0.003);
  });
});
