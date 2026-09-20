"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
  ConventionsState,
  CreateConventionSkillBody,
  UpdateConventionBody,
  Skill,
} from "@devdigest/shared";
import { api } from "../api";

const key = (repoId: string, status: string) => ["conventions", repoId, status] as const;

export function useConventions(repoId: string | null | undefined, status = "pending,accepted") {
  return useQuery({
    queryKey: repoId ? key(repoId, status) : ["conventions", null, status],
    queryFn: () => api.get<ConventionsState>(`/repos/${repoId}/conventions?status=${status}`),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.last_scan?.status === "running" ? 3_000 : false),
  });
}

export function useExtractConventions(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: ({ state }) => {
      queryClient.setQueryData(key(repoId, "pending,accepted"), state);
      queryClient.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export function useUpdateConvention(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConventionBody }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["conventions", repoId] });
      const previous = queryClient.getQueriesData<ConventionsState>({ queryKey: ["conventions", repoId] });
      queryClient.setQueriesData<ConventionsState>({ queryKey: ["conventions", repoId] }, (state) => {
        if (!state) return state;
        const candidates = state.candidates
          .map((candidate) => (candidate.id === id ? { ...candidate, ...patch } : candidate))
          .filter((candidate) => candidate.status !== "rejected");
        return { ...state, candidates };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export function useConventionSkillDraft(repoId: string) {
  return useMutation({
    mutationFn: (convention_ids: string[]) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, { convention_ids }),
  });
}

export function useCreateConventionSkill(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConventionSkillBody) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, body),
    onSuccess: (_skill, body) => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent-skills", body.agent_id] });
    },
  });
}

export type ConventionFilter = "all" | ConventionStatus;
