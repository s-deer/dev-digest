import type { Skill, SkillType } from "@devdigest/shared";
import { SKILL_LIMITS } from "../constants";

export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const EMPTY_DRAFT: SkillDraft = { name: "", description: "", type: "custom", body: "" };

export function toDraft(skill: Pick<Skill, "name" | "description" | "type" | "body">): SkillDraft {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/** Same rules the server enforces: all fields required after trimming, within the limits. */
export function isDraftValid(draft: SkillDraft): boolean {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const body = draft.body.trim();
  return (
    name.length > 0 &&
    name.length <= SKILL_LIMITS.name &&
    description.length > 0 &&
    description.length <= SKILL_LIMITS.description &&
    body.length > 0 &&
    body.length <= SKILL_LIMITS.body
  );
}

export function isDraftDirty(draft: SkillDraft, original: SkillDraft): boolean {
  return (Object.keys(draft) as (keyof SkillDraft)[]).some((key) => draft[key] !== original[key]);
}
