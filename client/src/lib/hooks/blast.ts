/* hooks/blast.ts — Blast Radius (L04). The PR's changed symbols and their
   downstream callers, endpoints, and crons, read straight from the
   repo-intel index. Read-only; no LLM call. Modelled on hooks/smart-diff.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { api } from "../api";

export const blastKey = (prId: string | null | undefined) => ["pr-blast", prId] as const;

/** The PR's blast radius. Disabled until `prId` resolves — disabled queries
   stay `isPending`, never `isLoading`; branch on `!prId || isLoading`, not
   `isPending` (see client/INSIGHTS.md, 2026-09-26). */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: blastKey(prId),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
