/* hooks/brief.ts — generated PR Brief (L05). Read the stored brief via GET
   (never calls the model) and (re)generate it via POST. Imported from this
   file directly, not through the hooks barrel. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrBriefResponse } from "@devdigest/shared";
import { api } from "../api";

export const briefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

/** The stored brief (or null before the first generation) plus its stale flag. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate (or refresh) the brief. A failed call writes nothing, so the
   previously cached brief stays on screen. */
export function useGenerateBrief(prId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (res) => {
      queryClient.setQueryData<PrBriefResponse>(briefKey(prId), { brief: res.brief, stale: false });
    },
  });
}
