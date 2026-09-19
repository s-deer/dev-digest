import type { AgentSkillLink, Skill } from "@devdigest/shared";

/**
 * Attachment rules for the agent Skills tab. A link's `order` is its slot in
 * the prompt; switching a skill off keeps the link (and its slot) so switching
 * it back on restores the position. Only Detach removes the link.
 */

export type Link = Pick<AgentSkillLink, "skill_id" | "enabled" | "order">;

export function sortLinks<T extends Link>(links: readonly T[]): T[] {
  return [...links].sort((a, b) => a.order - b.order);
}

/** Dense 0..n-1 orders in current sequence — what POST /agents/:id/skills expects. */
export function normalize(links: readonly Link[]): Link[] {
  return sortLinks(links).map((link, order) => ({ skill_id: link.skill_id, enabled: link.enabled, order }));
}

/** On: re-enable an existing link in place, or attach at the end. */
export function enableSkill(links: readonly Link[], skillId: string): Link[] {
  const existing = links.find((link) => link.skill_id === skillId);
  if (existing) return normalize(links.map((link) => (link.skill_id === skillId ? { ...link, enabled: true } : link)));
  const next = links.reduce((max, link) => Math.max(max, link.order), -1) + 1;
  return normalize([...links, { skill_id: skillId, enabled: true, order: next }]);
}

/** Off: keep the link and its slot. */
export function disableSkill(links: readonly Link[], skillId: string): Link[] {
  return normalize(links.map((link) => (link.skill_id === skillId ? { ...link, enabled: false } : link)));
}

export function detachSkill(links: readonly Link[], skillId: string): Link[] {
  return normalize(links.filter((link) => link.skill_id !== skillId));
}

/** Dense 0..n-1 orders for links already in their final sequence. */
function renumber(links: readonly Link[]): Link[] {
  return links.map((link, order) => ({ skill_id: link.skill_id, enabled: link.enabled, order }));
}

/**
 * Drag & drop: move an enabled skill to an enabled target's position. Only the
 * enabled subsequence is reordered; switched-off links keep their slots.
 */
export function moveTo(links: readonly Link[], skillId: string, targetSkillId: string): Link[] {
  const sorted = sortLinks(links);
  const enabled = sorted.filter((link) => link.enabled);
  const from = enabled.findIndex((link) => link.skill_id === skillId);
  const to = enabled.findIndex((link) => link.skill_id === targetSkillId);
  if (from < 0 || to < 0 || from === to) return renumber(sorted);
  const [moved] = enabled.splice(from, 1);
  enabled.splice(to, 0, moved!);
  let next = 0;
  return renumber(sorted.map((link) => (link.enabled ? enabled[next++]! : link)));
}

/** Up/down: swap with the neighbouring enabled skill. */
export function moveBy(links: readonly Link[], skillId: string, direction: -1 | 1): Link[] {
  const enabled = sortLinks(links).filter((link) => link.enabled);
  const index = enabled.findIndex((link) => link.skill_id === skillId);
  const neighbour = enabled[index + direction];
  if (index < 0 || !neighbour) return normalize(links);
  return moveTo(links, skillId, neighbour.skill_id);
}

export interface SkillRow {
  skill: Skill;
  link: Link | undefined;
  /** Enabled for this agent — the only rows that can be dragged. */
  active: boolean;
}

/**
 * Every workspace skill: enabled attachments first in prompt order, then
 * switched-off attachments in their slot order, then unattached by name.
 */
export function buildRows(skills: readonly Skill[], links: readonly Link[]): SkillRow[] {
  const bySkill = new Map(links.map((link) => [link.skill_id, link]));
  const rank = (row: SkillRow) => (row.active ? 0 : row.link ? 1 : 2);
  return skills
    .map((skill) => {
      const link = bySkill.get(skill.id);
      return { skill, link, active: !!link?.enabled };
    })
    .sort((a, b) => rank(a) - rank(b) || (a.link && b.link ? a.link.order - b.link.order : a.skill.name.localeCompare(b.skill.name)));
}

export function matchesQuery(skill: Pick<Skill, "name" | "description">, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${skill.name} ${skill.description}`.toLowerCase().includes(q);
}
