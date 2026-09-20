/* SkillBlocks — the enabled skills of a run, one PromptBlock each in prompt
   order, headed by the skills block's own token total. Older traces without
   per-skill blocks fall back to the single joined block. */
"use client";

import { useTranslations } from "next-intl";
import type { PromptAssembly } from "@devdigest/shared";
import { PROMPT_COLORS } from "../../constants";
import { PromptBlock } from "../PromptBlock";

export function SkillBlocks({ assembly }: { assembly: PromptAssembly }) {
  const t = useTranslations("runs");
  const blocks = assembly.skill_blocks ?? [];

  if (blocks.length === 0) {
    if (assembly.skills == null) return null;
    return (
      <PromptBlock
        label={`${t("trace.prompt.skills")} (${t("trace.prompt.skillsTokens", { count: assembly.skills_tokens })})`}
        text={assembly.skills}
        color={PROMPT_COLORS.skills}
      />
    );
  }

  return (
    <div data-testid="trace-skill-blocks">
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", margin: "10px 0 6px" }}>
        {t("trace.prompt.skillsGroup", { count: blocks.length, tokens: assembly.skills_tokens })}
      </div>
      {blocks.map((block) => (
        <PromptBlock
          key={block.skill_id}
          label={t("trace.prompt.skillBlock", { name: block.name, version: block.version, tokens: block.tokens })}
          text={block.body}
          color={PROMPT_COLORS.skills}
        />
      ))}
    </div>
  );
}
