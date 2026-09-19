"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkillLinks } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

function sortedLinks(links: AgentSkillLink[]) {
  return [...links].sort((a, b) => a.order - b.order);
}

function reorder(links: AgentSkillLink[], skillId: string, direction: -1 | 1) {
  const next = sortedLinks(links);
  const index = next.findIndex((link) => link.skill_id === skillId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return next.map((link, order) => ({ ...link, order }));
}

function reorderTo(links: AgentSkillLink[], skillId: string, targetSkillId: string) {
  const next = sortedLinks(links);
  const from = next.findIndex((link) => link.skill_id === skillId);
  const target = next.findIndex((link) => link.skill_id === targetSkillId);
  if (from < 0 || target < 0 || from === target) return next;
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved!);
  return next.map((link, order) => ({ ...link, order }));
}

function nextLinks(links: AgentSkillLink[], skill: Skill, attached: boolean) {
  if (!attached) return links.filter((link) => link.skill_id !== skill.id);
  return [...sortedLinks(links), { agent_id: "", skill_id: skill.id, enabled: true, order: links.length }];
}

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkillLinks(agent.id);
  const save = useSetAgentSkillLinks();
  const [query, setQuery] = React.useState("");
  const [draggedSkillId, setDraggedSkillId] = React.useState<string | null>(null);
  const current = links ?? [];
  const linkBySkill = new Map(current.map((link) => [link.skill_id, link]));
  const skillById = new Map((skills ?? []).map((skill) => [skill.id, skill]));
  const visible = [...(skills ?? [])]
    .filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const left = linkBySkill.get(a.id)?.order;
      const right = linkBySkill.get(b.id)?.order;
      if (left === undefined && right === undefined) return a.name.localeCompare(b.name);
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      return left - right;
    });
  const enabledCount = current.filter((link) => link.enabled && skillById.get(link.skill_id)?.enabled).length;

  const persist = (next: AgentSkillLink[]) => {
    save.mutate({
      agentId: agent.id,
      links: sortedLinks(next).map((link, order) => ({ skill_id: link.skill_id, enabled: link.enabled, order })),
    });
  };

  if (skillsLoading || linksLoading) return <Skeleton height={260} />;

  return (
    <section style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: enabledCount, total: skills?.length ?? 0 })}
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
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.list}>
        {visible.map((skill) => {
          const link = linkBySkill.get(skill.id);
          const order = link?.order ?? -1;
          const attached = !!link;
          return (
            <article
              key={skill.id}
              style={s.row(attached, skill.enabled, draggedSkillId === skill.id)}
              onDragOver={(event) => {
                if (draggedSkillId && attached) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const skillId = event.dataTransfer.getData("text/plain") || draggedSkillId;
                if (skillId && attached) persist(reorderTo(current, skillId, skill.id));
                setDraggedSkillId(null);
              }}
            >
              {attached ? (
                <span
                  aria-hidden="true"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", skill.id);
                    setDraggedSkillId(skill.id);
                  }}
                  onDragEnd={() => setDraggedSkillId(null)}
                  style={s.grip}
                >
                  <Icon.Menu size={14} />
                </span>
              ) : (
                <span style={s.grip} aria-hidden="true" />
              )}
              <button
                type="button"
                role="checkbox"
                aria-checked={attached}
                aria-label={skill.name}
                onClick={() => persist(nextLinks(current, skill, !attached))}
                style={s.checkbox(attached)}
              >
                {attached && <Icon.Check size={11} style={{ color: "#fff" }} />}
              </button>
              <span className="mono" style={s.skillName}>{skill.name}</span>
              <Badge color={s.typeColor(skill.type)} bg={s.typeBackground(skill.type)}>{t(`skills.type.${skill.type}`)}</Badge>
              <div style={s.controls}>
                {!skill.enabled && <Badge color="var(--text-muted)">{t("skills.globalDisabled")}</Badge>}
                {attached && (
                  <>
                    <label style={s.toggleLabel}>{t("skills.enabled")}<Toggle on={link.enabled} onChange={(enabled) => persist(current.map((item) => item.skill_id === skill.id ? { ...item, enabled } : item))} size={15} /></label>
                    <button type="button" aria-label={t("skills.moveUp")} title={t("skills.moveUp")} onClick={() => persist(reorder(current, skill.id, -1))} disabled={order === 0 || save.isPending} style={s.iconButton(order === 0 || save.isPending)}><Icon.ArrowUp size={14} /></button>
                    <button type="button" aria-label={t("skills.moveDown")} title={t("skills.moveDown")} onClick={() => persist(reorder(current, skill.id, 1))} disabled={order === current.length - 1 || save.isPending} style={s.iconButton(order === current.length - 1 || save.isPending)}><Icon.ArrowDown size={14} /></button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
