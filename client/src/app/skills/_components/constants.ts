import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Mirrors the server's CreateSkillBody limits (server/src/modules/skills/routes.ts). */
export const SKILL_LIMITS = { name: 120, description: 2_000, body: 100_000 } as const;
