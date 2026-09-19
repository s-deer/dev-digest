"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillImportPreview, SkillSource, SkillType } from "@devdigest/shared";

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: Extract<SkillSource, "manual" | "extracted">;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: () => api.get<Skill[]>("/skills") });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (skill) => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.setQueryData(["skill", skill.id], skill);
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useSkillImportPreview() {
  return useMutation({
    mutationFn: (markdown: string) => api.post<SkillImportPreview>("/skills/import-preview", { markdown }),
  });
}
