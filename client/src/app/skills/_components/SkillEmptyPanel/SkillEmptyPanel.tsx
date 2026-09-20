import { EmptyState } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/** The detail pane before a skill has been selected. */
export function SkillEmptyPanel() {
  const t = useTranslations("skills");

  return (
    <div className="dd-skills-empty" style={s.panel}>
      <EmptyState icon="Sparkles" title={t("sidebar.selectSkill")} body={t("sidebar.selectSkillBody")} />
    </div>
  );
}
