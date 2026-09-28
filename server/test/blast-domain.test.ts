import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { countBlast, summarizeBlast, toBlastRadius } from '../src/modules/blast/domain.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

/**
 * blast/domain.ts — pure mapping from the facade's flat `BlastResult`
 * (callers keyed by `viaSymbol`) into the grouped `BlastRadiusResponse`
 * contract. No I/O, no Docker.
 */

function result(overrides: Partial<BlastResult>): BlastResult {
  return {
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
    degraded: false,
    ...overrides,
  };
}

describe('toBlastRadius', () => {
  it('groups flat callers by viaSymbol into separate downstream entries', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'a.ts', name: 'foo', kind: 'function' },
          { file: 'c.ts', name: 'bar', kind: 'function' },
        ],
        callers: [
          { file: 'b.ts', symbol: 'caller1', viaSymbol: 'foo', line: 10, rank: 1 },
          { file: 'b.ts', symbol: 'caller2', viaSymbol: 'foo', line: 20, rank: 1 },
          { file: 'd.ts', symbol: 'caller3', viaSymbol: 'bar', line: 5, rank: 1 },
        ],
      }),
    );

    const foo = blast.downstream.find((d) => d.symbol === 'foo');
    const bar = blast.downstream.find((d) => d.symbol === 'bar');
    expect(foo?.callers).toHaveLength(2);
    expect(bar?.callers).toHaveLength(1);
  });

  it('drops a caller located in the symbol\'s own declaring file', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [
          { file: 'a.ts', symbol: 'selfCaller', viaSymbol: 'foo', line: 2, rank: 10 },
          { file: 'b.ts', symbol: 'realCaller', viaSymbol: 'foo', line: 4, rank: 1 },
        ],
      }),
    );

    const foo = blast.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.callers).toEqual([{ name: 'realCaller', file: 'b.ts', line: 4 }]);
  });

  it('dedupes callers on file|line|symbol', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [
          { file: 'b.ts', symbol: 'caller1', viaSymbol: 'foo', line: 10, rank: 1 },
          { file: 'b.ts', symbol: 'caller1', viaSymbol: 'foo', line: 10, rank: 1 },
        ],
      }),
    );

    const foo = blast.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.callers).toHaveLength(1);
  });

  it('caps callers per symbol at the given maxCallersPerSymbol, keeping the highest-ranked (no hardcoded 20)', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [
          { file: 'b.ts', symbol: 'low', viaSymbol: 'foo', line: 1, rank: 1 },
          { file: 'b.ts', symbol: 'mid', viaSymbol: 'foo', line: 2, rank: 5 },
          { file: 'b.ts', symbol: 'high', viaSymbol: 'foo', line: 3, rank: 9 },
        ],
      }),
      2,
    );

    const foo = blast.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.callers.map((c) => c.name)).toEqual(['high', 'mid']);
  });

  it('sorts callers by rank desc, then file, then line for a deterministic order', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [
          { file: 'z.ts', symbol: 'zLow', viaSymbol: 'foo', line: 1, rank: 3 },
          { file: 'b.ts', symbol: 'bLow', viaSymbol: 'foo', line: 1, rank: 3 },
          { file: 'b.ts', symbol: 'bHigh', viaSymbol: 'foo', line: 5, rank: 9 },
        ],
      }),
    );

    const foo = blast.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.callers.map((c) => c.name)).toEqual(['bHigh', 'bLow', 'zLow']);
  });

  it('attributes endpoints and crons per group separately, from factsByFile over that group\'s caller files', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'a.ts', name: 'foo', kind: 'function' },
          { file: 'x.ts', name: 'bar', kind: 'function' },
        ],
        callers: [
          { file: 'b.ts', symbol: 'callerFoo', viaSymbol: 'foo', line: 1, rank: 1 },
          { file: 'y.ts', symbol: 'callerBar', viaSymbol: 'bar', line: 1, rank: 1 },
        ],
        factsByFile: {
          'b.ts': { endpoints: ['GET /foo'], crons: ['nightly-foo'] },
          'y.ts': { endpoints: ['POST /bar'], crons: [] },
        },
      }),
    );

    const foo = blast.downstream.find((d) => d.symbol === 'foo');
    const bar = blast.downstream.find((d) => d.symbol === 'bar');
    expect(foo?.endpoints_affected).toEqual(['GET /foo']);
    expect(foo?.crons_affected).toEqual(['nightly-foo']);
    expect(bar?.endpoints_affected).toEqual(['POST /bar']);
    expect(bar?.crons_affected).toEqual([]);
  });

  it('returns [] endpoints/crons when factsByFile is absent (fallback path)', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [{ file: 'b.ts', symbol: 'caller', viaSymbol: 'foo', line: 1, rank: 0 }],
      }),
    );

    const foo = blast.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.endpoints_affected).toEqual([]);
    expect(foo?.crons_affected).toEqual([]);
  });

  it('orders groups by max caller rank, descending', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [
          { file: 'a.ts', name: 'foo', kind: 'function' },
          { file: 'c.ts', name: 'bar', kind: 'function' },
        ],
        callers: [
          { file: 'b.ts', symbol: 'callerFoo', viaSymbol: 'foo', line: 1, rank: 5 },
          { file: 'd.ts', symbol: 'callerBar', viaSymbol: 'bar', line: 1, rank: 9 },
        ],
      }),
    );

    expect(blast.downstream.map((d) => d.symbol)).toEqual(['bar', 'foo']);
  });

  it('handles the empty case: no changed symbols, no callers', () => {
    const blast = toBlastRadius(result({}));
    expect(blast.changed_symbols).toEqual([]);
    expect(blast.downstream).toEqual([]);
    expect(blast.summary).toBe('0 symbol(s) changed, 0 caller(s), 0 endpoint(s), 0 cron(s) affected');
  });

  it('passes degraded/reason through from the facade result', () => {
    const degraded = toBlastRadius(result({ degraded: true, reason: 'index_partial' }));
    expect(degraded.degraded).toBe(true);
    expect(degraded.reason).toBe('index_partial');

    const clean = toBlastRadius(result({ degraded: false }));
    expect(clean.degraded).toBe(false);
    expect(clean.reason).toBeNull();
  });

  it('produces a shape that satisfies BlastRadiusResponse.safeParse', () => {
    const blast = toBlastRadius(
      result({
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [{ file: 'b.ts', symbol: 'caller', viaSymbol: 'foo', line: 1, rank: 1 }],
        factsByFile: { 'b.ts': { endpoints: ['GET /foo'], crons: [] } },
        degraded: false,
      }),
    );
    expect(BlastRadiusResponse.safeParse(blast).success).toBe(true);
  });
});

describe('countBlast / summarizeBlast', () => {
  it('counts unique endpoints/crons across groups, and total callers', () => {
    const changedSymbols = [
      { name: 'foo', file: 'a.ts', kind: 'function' },
      { name: 'bar', file: 'c.ts', kind: 'function' },
    ];
    const downstream = [
      {
        symbol: 'foo',
        callers: [{ name: 'c1', file: 'b.ts', line: 1 }],
        endpoints_affected: ['GET /foo'],
        crons_affected: ['nightly'],
      },
      {
        symbol: 'bar',
        callers: [{ name: 'c2', file: 'd.ts', line: 1 }, { name: 'c3', file: 'e.ts', line: 1 }],
        endpoints_affected: ['GET /foo', 'POST /bar'],
        crons_affected: ['nightly'],
      },
    ];

    expect(countBlast(changedSymbols, downstream)).toEqual({
      symbols: 2,
      callers: 3,
      endpoints: 2,
      crons: 1,
    });
    expect(summarizeBlast(changedSymbols, downstream)).toBe(
      '2 symbol(s) changed, 3 caller(s), 2 endpoint(s), 1 cron(s) affected',
    );
  });
});
