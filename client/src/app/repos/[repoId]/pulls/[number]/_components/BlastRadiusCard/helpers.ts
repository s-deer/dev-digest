import type { BlastRadiusResponse } from "@devdigest/shared";

export interface BlastStatsCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/**
 * Stats-row counts for a `BlastRadiusResponse`. `endpoints`/`crons` are
 * deduped across all downstream groups (the same endpoint can be reached via
 * two different symbols' callers). Mirrors the server's `countBlast`
 * (server/src/modules/blast/domain.ts), computed independently on data
 * already in hand — no extra request.
 */
export function blastStats(blast: BlastRadiusResponse): BlastStatsCounts {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return { symbols: blast.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}
