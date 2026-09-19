"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLORS, SkillTypeBadge } from "../../../../../../components/skill-type-badge";
import { SOURCE_ICONS } from "./constants";
import { s } from "./styles";

/** Grid tile: name, workspace-wide toggle, description, type/source/version, agent count, delete. */
export function SkillCard({
  skill,
  active,
  onOpen,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  active: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLORS[skill.type];
  return (
    // The card is a mouse convenience only: a role=button container would make its
    // nested Toggle / delete controls presentational, so the keyboard + screen-reader
    // way to open a skill is the name <button> below (its click bubbles to onOpen).
    <article onClick={onOpen} style={s.card(active, skill.enabled)}>
      <div style={s.header}>
        <div style={s.iconBox(color.fg, color.bg)}>
          <Icon.Sparkles size={14} />
        </div>
        <button type="button" className="mono" aria-pressed={active} style={s.nameButton} title={skill.name}>
          {skill.name}
        </button>
        <div role="group" aria-label={t("card.toggle", { name: skill.name })} onClick={(event) => event.stopPropagation()}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
      </div>
      <p style={s.description}>{skill.description}</p>
      <div style={s.badges}>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        <Badge icon={SOURCE_ICONS[skill.source]}>{t(`source.${skill.source}`)}</Badge>
        <Badge icon="GitCommit" mono>
          {t("card.version", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.footer}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon.Cpu size={12} />
          {t("card.agents", { count: skill.agent_count })}
        </span>
        <button
          type="button"
          aria-label={t("card.delete", { name: skill.name })}
          title={t("card.delete", { name: skill.name })}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          style={s.deleteButton}
        >
          <Icon.Trash size={14} />
        </button>
      </div>
    </article>
  );
}
