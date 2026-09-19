import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** The body rendered as Markdown, i.e. how it reads in the agent's prompt. */
export function PreviewTab({ skill }: { skill: Pick<Skill, "body"> }) {
  const t = useTranslations("skills");
  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 16px" }}>{t("preview.hint")}</p>
      <div style={{ padding: "16px 20px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)" }}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
