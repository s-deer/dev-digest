/* AgentCard — model chip, attached-skill count, enabled toggle, delete. Stats
   are an A5 mount; we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { DeleteAgentModal } from "./_components/DeleteAgentModal";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const [deleting, setDeleting] = React.useState(false);
  const color = modelColor(ag.model);
  return (
    <>
      {deleting && <DeleteAgentModal agent={ag} onClose={() => setDeleting(false)} />}
      <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
        <div style={s.headerRow}>
          <div style={s.iconBox}>
            <Icon.Cpu size={15} />
          </div>
          <span style={s.name}>{ag.name}</span>
          {onToggle && (
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle on={ag.enabled} onChange={onToggle} size={14} />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleting(true);
            }}
            title={t("card.delete", { name: ag.name })}
            aria-label={t("card.delete", { name: ag.name })}
            style={s.deleteButton}
          >
            <Icon.Trash size={14} />
          </button>
        </div>
        <div style={s.description}>{ag.description || t("card.noDescription")}</div>
        <div style={s.metaRow}>
          <span className="mono" style={s.modelChip(color)}>
            {ag.model}
          </span>
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: ag.skill_count })}
          </Badge>
        </div>
      </div>
    </>
  );
}
