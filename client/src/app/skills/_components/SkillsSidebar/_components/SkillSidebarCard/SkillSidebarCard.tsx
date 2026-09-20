"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle, type IconName } from "@devdigest/ui";
import type { Skill, SkillSource } from "@devdigest/shared";
import { SKILL_TYPE_COLORS, SkillTypeBadge } from "@/components/skill-type-badge";
import { s } from "./styles";

const SOURCE_ICONS: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "Link",
  extracted: "Wrench",
  community: "Globe",
};

/** Compact selectable skill summary for the master pane. */
export function SkillSidebarCard({
  skill,
  active,
  onSelect,
  onToggle,
}: {
  skill: Skill;
  active: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLORS[skill.type];

  return (
    <article onClick={onSelect} style={s.card(active, skill.enabled)}>
      <div style={s.header}>
        <div style={s.iconBox(color.fg, color.bg)}>
          <Icon.Sparkles size={14} />
        </div>
        <button type="button" className="mono" aria-current={active ? "page" : undefined} style={s.name} title={skill.name}>
          {skill.name}
        </button>
        <div onClick={(event) => event.stopPropagation()}>
          <Toggle ariaLabel={t("card.toggle", { name: skill.name })} on={skill.enabled} onChange={onToggle} size={14} />
        </div>
      </div>
      <p style={s.description}>{skill.description}</p>
      <div style={s.badges}>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        <Badge icon={SOURCE_ICONS[skill.source]}>{t(`source.${skill.source}`)}</Badge>
        <Badge icon="Cpu">{t("card.agents", { count: skill.agent_count })}</Badge>
      </div>
    </article>
  );
}
