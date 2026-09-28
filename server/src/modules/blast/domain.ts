import type {
  BlastCaller,
  BlastRadiusResponse,
  ChangedSymbol,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';
import { MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';

/**
 * Pure mapping from the repo-intel facade's flat `BlastResult` (callers keyed
 * by `viaSymbol`) into the `BlastRadiusResponse` contract (callers grouped
 * under their symbol, with endpoints/crons attributed per group). No I/O —
 * `blast/service.ts` is the only caller.
 */

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/**
 * Build the `BlastRadiusResponse` from the facade's result.
 *   1. `changed_symbols` = the facade's changed symbols, remapped field order.
 *   2. Drop callers located in the symbol's own declaring file (defensive
 *      guard — the facade already filters this, but don't trust it twice).
 *   3. Group the remaining callers by `viaSymbol`; per group dedupe on
 *      `file|line|symbol`, sort by rank desc / file / line, and cap at
 *      `maxCallersPerSymbol`.
 *   4. Per group, `endpoints_affected`/`crons_affected` are sorted unique
 *      unions from `factsByFile` over that group's (capped) caller files.
 *   5. Groups are ordered by their max caller rank, desc.
 *   6. `summary` is a deterministic string from `summarizeBlast`.
 *   7. `degraded`/`reason` pass through from the facade result.
 */
export function toBlastRadius(
  result: BlastResult,
  maxCallersPerSymbol: number = MAX_CALLERS_PER_SYMBOL,
): BlastRadiusResponse {
  const changedSymbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const declaringFileByName = new Map(result.changedSymbols.map((s) => [s.name, s.file]));
  const callers = result.callers.filter((c) => declaringFileByName.get(c.viaSymbol) !== c.file);

  const bySymbol = new Map<string, BlastCallerRow[]>();
  for (const c of callers) {
    const group = bySymbol.get(c.viaSymbol);
    if (group) group.push(c);
    else bySymbol.set(c.viaSymbol, [c]);
  }

  const factsByFile = result.factsByFile ?? {};
  const groups: Array<{ maxRank: number; downstream: DownstreamImpact }> = [];

  for (const [symbol, rows] of bySymbol) {
    const deduped = dedupeCallers(rows).sort(byRankFileLine);
    const capped = deduped.slice(0, maxCallersPerSymbol);

    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of capped) {
      const facts = factsByFile[c.file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const cr of facts.crons) crons.add(cr);
    }

    const callersOut: BlastCaller[] = capped.map((c) => ({ name: c.symbol, file: c.file, line: c.line }));

    groups.push({
      maxRank: deduped[0]?.rank ?? 0,
      downstream: {
        symbol,
        callers: callersOut,
        endpoints_affected: [...endpoints].sort(),
        crons_affected: [...crons].sort(),
      },
    });
  }

  groups.sort((a, b) => {
    if (b.maxRank !== a.maxRank) return b.maxRank - a.maxRank;
    return a.downstream.symbol < b.downstream.symbol ? -1 : a.downstream.symbol > b.downstream.symbol ? 1 : 0;
  });
  const downstream = groups.map((g) => g.downstream);

  return {
    changed_symbols: changedSymbols,
    downstream,
    summary: summarizeBlast(changedSymbols, downstream),
    degraded: result.degraded ?? false,
    reason: result.reason ?? null,
  };
}

function dedupeCallers(rows: BlastCallerRow[]): BlastCallerRow[] {
  const seen = new Set<string>();
  const out: BlastCallerRow[] = [];
  for (const r of rows) {
    const key = `${r.file}|${r.line}|${r.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function byRankFileLine(a: BlastCallerRow, b: BlastCallerRow): number {
  if (b.rank !== a.rank) return b.rank - a.rank;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line;
}

/** Counts for the route's `blast: built` log line — pure so it has a
 *  hermetic test instead of only being exercised through the route. */
export function countBlast(changedSymbols: ChangedSymbol[], downstream: DownstreamImpact[]): BlastCounts {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return { symbols: changedSymbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** Deterministic summary string, no model call. */
export function summarizeBlast(changedSymbols: ChangedSymbol[], downstream: DownstreamImpact[]): string {
  const counts = countBlast(changedSymbols, downstream);
  return (
    `${counts.symbols} symbol(s) changed, ${counts.callers} caller(s), ` +
    `${counts.endpoints} endpoint(s), ${counts.crons} cron(s) affected`
  );
}
