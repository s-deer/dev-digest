import type { SkillType } from "@devdigest/shared";

/** Accent per skill type, shared by the Skills page and the agent Skills tab. */
export const SKILL_TYPE_COLORS: Record<SkillType, { fg: string; bg: string }> = {
  rubric: { fg: "var(--accent-text)", bg: "var(--accent-bg)" },
  convention: { fg: "var(--ok)", bg: "var(--ok-bg)" },
  security: { fg: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { fg: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
