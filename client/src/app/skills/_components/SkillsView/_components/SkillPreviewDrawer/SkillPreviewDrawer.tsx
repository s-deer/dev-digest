"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";

/** Side-panel preview of a skill with the rendered body; Open goes to /skills/:id. */
export function SkillPreviewDrawer({
  skill,
  onClose,
  onOpen,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  onClose: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <Drawer
      width={600}
      title={<span className="mono">{skill.name}</span>}
      subtitle={skill.description}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10 }}>
          <Button kind="primary" icon="ExternalLink" onClick={onOpen}>
            {t("drawer.open")}
          </Button>
          <Button kind="secondary" icon="Edit" onClick={onEdit}>
            {t("drawer.edit")}
          </Button>
          <Button kind="ghost" icon="Trash" onClick={onDelete} style={{ marginLeft: "auto" }}>
            {t("drawer.delete")}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
        <Badge>{t(`source.${skill.source}`)}</Badge>
        <Badge icon="GitCommit" mono>
          {t("card.version", { version: skill.version })}
        </Badge>
        <Badge icon="Cpu">{t("card.agents", { count: skill.agent_count })}</Badge>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>{t("drawer.body")}</div>
      <Markdown>{skill.body}</Markdown>
    </Drawer>
  );
}
