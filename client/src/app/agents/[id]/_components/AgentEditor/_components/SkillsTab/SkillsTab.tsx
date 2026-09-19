"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkillLinks } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { buildRows, detachSkill, disableSkill, enableSkill, matchesQuery, moveBy, moveTo, type Link } from "./helpers";
import { SkillRow } from "./_components/SkillRow";
import { s } from "./styles";

/**
 * Every workspace skill with a per-agent switch. Enabled skills are injected
 * into this agent's prompt in the order shown; only they can be reordered.
 */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading, isError: skillsError, refetch: refetchSkills } = useSkills();
  const {
    data: links,
    isLoading: linksLoading,
    isError: linksError,
    refetch: refetchLinks,
  } = useAgentSkillLinks(agent.id);
  const save = useSetAgentSkillLinks();
  const [query, setQuery] = React.useState("");
  const [dragged, setDragged] = React.useState<string | null>(null);

  if (skillsLoading || linksLoading) return <Skeleton height={260} />;
  // Without the real link set, `links ?? []` would show every skill as off and the
  // next toggle would POST a list that replaces (wipes) the agent's attachments.
  if (skillsError || linksError || !links) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          if (skillsError) refetchSkills();
          if (linksError || !links) refetchLinks();
        }}
      />
    );
  }

  const current: Link[] = links;
  const rows = buildRows(skills ?? [], current);
  const visible = rows.filter((row) => matchesQuery(row.skill, query));
  const enabledCount = rows.filter((row) => row.active && row.skill.enabled).length;
  // Reordering a filtered list would move skills relative to hidden ones.
  const canReorder = !query.trim() && !save.isPending;
  const activeIds = rows.filter((row) => row.active).map((row) => row.skill.id);

  const persist = (next: Link[]) => save.mutate({ agentId: agent.id, links: next });

  return (
    <section style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: enabledCount, total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{query.trim() ? t("skills.filterNoReorder") : t("skills.orderHint")}</p>
      <div style={s.list}>
        {visible.map(({ skill, link, active }) => {
          const draggable = active && canReorder;
          return (
            <SkillRow
              key={skill.id}
              skill={skill}
              link={link}
              active={active}
              dragging={dragged === skill.id}
              draggable={draggable}
              position={activeIds.indexOf(skill.id)}
              activeCount={activeIds.length}
              canReorder={canReorder}
              pending={save.isPending}
              onToggle={(on) => persist(on ? enableSkill(current, skill.id) : disableSkill(current, skill.id))}
              onMove={(direction) => persist(moveBy(current, skill.id, direction))}
              onDetach={() => persist(detachSkill(current, skill.id))}
              onDragStart={() => setDragged(skill.id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => {
                if (dragged && draggable && dragged !== skill.id) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged && draggable) persist(moveTo(current, dragged, skill.id));
                setDragged(null);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
