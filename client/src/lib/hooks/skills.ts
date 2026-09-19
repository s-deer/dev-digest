"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillImportPreview, SkillSource, SkillType, SkillVersion } from "@devdigest/shared";

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: Extract<SkillSource, "manual" | "imported_file" | "extracted">;
  body: string;
  enabled?: boolean;
  /** Note on the initial v1 snapshot, e.g. "Imported from foo.zip". */
  version_note?: string;
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export interface SkillUpload {
  filename: string;
  content_base64: string;
}

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: () => api.get<Skill[]>("/skills") });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
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
    // Optimistic list update so card toggles respond immediately.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["skills"] });
      const previous = queryClient.getQueryData<Skill[]>(["skills"]);
      queryClient.setQueryData<Skill[]>(["skills"], (list) =>
        list?.map((skill) => (skill.id === id ? { ...skill, ...patch } : skill)),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["skills"], context.previous);
    },
    onSuccess: (skill) => {
      queryClient.setQueryData(["skill", skill.id], skill);
      queryClient.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: ["skill", id] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      // Deleting a skill cascades its agent attachments.
      queryClient.invalidateQueries({ queryKey: ["agent-skills"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useRestoreSkillVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (skill) => {
      queryClient.setQueryData(["skill", skill.id], skill);
      queryClient.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/** Parses an uploaded .md/.zip on the server; nothing is stored until useCreateSkill. */
export function useSkillImportPreview() {
  return useMutation({
    mutationFn: (upload: SkillUpload) => api.post<SkillImportPreview>("/skills/import-preview", upload),
  });
}
