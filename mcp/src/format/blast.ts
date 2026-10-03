import type { BlastRadiusResponse } from '@devdigest/shared';

export interface FormattedBlastDownstream extends Record<string, unknown> {
  symbol: string;
  callers: string[];
  endpoints: string[];
  crons: string[];
}

export interface FormattedBlast extends Record<string, unknown> {
  repo: string;
  prNumber: number;
  summary: string;
  degraded: boolean;
  reason: string | null;
  changedSymbols: string[];
  downstream: FormattedBlastDownstream[];
  hint?: string;
}

export interface FormatBlastContext {
  repo: string;
  prNumber: number;
}

const RESYNC_HINT =
  'This data may be stale or partial — resync the repo in DevDigest to rebuild the index, then retry.';
const NO_SYMBOLS_HINT =
  'No changed symbols were found — open this PR in DevDigest once so its files are imported, then retry.';

/**
 * Ring 1 — pure. Flattens `BlastRadiusResponse` for the tool's compact output:
 * changed symbols as "name (file)", callers as "file:line name" (`endpoints`/
 * `crons` are already plain string lists). One hint at most: degraded data
 * suggests a resync; otherwise zero changed symbols suggests importing the
 * PR first (see `mcp/README.md`'s discrepancy notes for why either can happen).
 */
export function formatBlast(blast: BlastRadiusResponse, context: FormatBlastContext): FormattedBlast {
  const changedSymbols = blast.changed_symbols.map((symbol) => `${symbol.name} (${symbol.file})`);
  const downstream: FormattedBlastDownstream[] = blast.downstream.map((impact) => ({
    symbol: impact.symbol,
    callers: impact.callers.map((caller) => `${caller.file}:${caller.line} ${caller.name}`),
    endpoints: impact.endpoints_affected,
    crons: impact.crons_affected,
  }));

  const result: FormattedBlast = {
    repo: context.repo,
    prNumber: context.prNumber,
    summary: blast.summary,
    degraded: blast.degraded,
    reason: blast.reason,
    changedSymbols,
    downstream,
  };

  const hint = blast.degraded ? RESYNC_HINT : changedSymbols.length === 0 ? NO_SYMBOLS_HINT : undefined;
  if (hint) result.hint = hint;
  return result;
}
