/* hooks/smart-diff.ts — Smart Diff (L03, Phase 4). The PR's files grouped by
   role (core → tests → wiring → docs → boilerplate), with each file's
   finding_lines from the latest review. Read-only; built server-side, no LLM
   call. Modelled on hooks/intent.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { SmartDiffResponse } from "@devdigest/shared";
import { api } from "../api";

export const smartDiffKey = (prId: string | null | undefined) => ["pr-smart-diff", prId] as const;

/** The PR's smart-diff grouping. Only enabled once the caller says the PR's
   files are loaded (avoids a race with GET /pulls/:id, which refreshes
   pr_files before responding). Disabled queries stay `isPending`, never
   `isLoading` — branch on `!enabled || isLoading`, not `isPending`. */
export function useSmartDiff(prId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: smartDiffKey(prId),
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId && enabled,
  });
}
