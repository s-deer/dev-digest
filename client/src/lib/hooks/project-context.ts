/* hooks/project-context.ts — Project Context: the repo's discovered Markdown
   docs (read-only listing + preview) and the per-repo docs attached to agents
   and skills. The server owns every token number; hooks only move data. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentProjectContext,
  ProjectContextAttachments,
  ProjectContextListing,
  ProjectDocumentRead,
} from "@devdigest/shared";
import { api } from "../api";

export const projectContextKeys = {
  all: ["project-context"] as const,
  listing: (repoId: string | null | undefined) => ["project-context", "listing", repoId] as const,
  document: (repoId: string | null | undefined, path: string | null | undefined) =>
    ["project-context", "document", repoId, path] as const,
  agentAll: ["project-context", "agent"] as const,
  agent: (agentId: string | null | undefined, repoId: string | null | undefined) =>
    ["project-context", "agent", agentId, repoId] as const,
  skill: (skillId: string | null | undefined, repoId: string | null | undefined) =>
    ["project-context", "skill", skillId, repoId] as const,
};

/** The repo's discovered docs. Use `refetch` for the page's Refresh action. */
export function useProjectDocuments(repoId: string | null | undefined) {
  return useQuery({
    queryKey: projectContextKeys.listing(repoId),
    queryFn: () => api.get<ProjectContextListing>(`/repos/${repoId}/project-context`),
    enabled: !!repoId,
    retry: false,
  });
}

/** One document's content for the preview. */
export function useProjectDocument(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: projectContextKeys.document(repoId, path),
    queryFn: () =>
      api.get<ProjectDocumentRead>(`/repos/${repoId}/project-context/document?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
    retry: false,
  });
}

/** Docs attached to an agent for a repo, plus those inherited from its skills. */
export function useAgentProjectContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: projectContextKeys.agent(agentId, repoId),
    queryFn: () => api.get<AgentProjectContext>(`/agents/${agentId}/project-context?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Whole-set replace of an agent's attached docs (ordered paths). */
export function useSetAgentProjectContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { agentId: string; repoId: string; paths: string[] }) =>
      api.put<AgentProjectContext>(`/agents/${v.agentId}/project-context`, { repo_id: v.repoId, paths: v.paths }),
    onSuccess: (saved, v) => {
      qc.setQueryData(projectContextKeys.agent(v.agentId, v.repoId), saved);
      void qc.invalidateQueries({ queryKey: projectContextKeys.listing(v.repoId) });
    },
  });
}

/** Docs attached to a skill for a repo. */
export function useSkillProjectContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: projectContextKeys.skill(skillId, repoId),
    queryFn: () => api.get<ProjectContextAttachments>(`/skills/${skillId}/project-context?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

/** Whole-set replace of a skill's attached docs. Agents inherit them, so agent views refetch. */
export function useSetSkillProjectContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { skillId: string; repoId: string; paths: string[] }) =>
      api.put<ProjectContextAttachments>(`/skills/${v.skillId}/project-context`, {
        repo_id: v.repoId,
        paths: v.paths,
      }),
    onSuccess: (saved, v) => {
      qc.setQueryData(projectContextKeys.skill(v.skillId, v.repoId), saved);
      void qc.invalidateQueries({ queryKey: projectContextKeys.agentAll });
      void qc.invalidateQueries({ queryKey: projectContextKeys.listing(v.repoId) });
    },
  });
}
