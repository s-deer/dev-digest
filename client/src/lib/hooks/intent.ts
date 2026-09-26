/* hooks/intent.ts — Intent Layer (L03). One derived PR intent per PR (cached
   by head SHA), read via GET and (re)generated via POST. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";
import { api } from "../api";

export const intentKey = (prId: string | null | undefined) => ["pr-intent", prId] as const;

/** The derived PR intent, or null before the first generation. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: intentKey(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    select: (r) => r.intent,
  });
}

/** Generate (or force-regenerate) the PR's intent. */
export function useGenerateIntent(prId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => api.post<PrIntentRecord>(`/pulls/${prId}/intent`, { force }),
    onSuccess: (record) => {
      queryClient.setQueryData<PrIntentResponse>(intentKey(prId), { intent: record });
      queryClient.invalidateQueries({ queryKey: ["pulls"] });
    },
  });
}
