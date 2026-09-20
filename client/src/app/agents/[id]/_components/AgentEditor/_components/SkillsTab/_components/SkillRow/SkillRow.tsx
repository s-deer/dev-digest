"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../../../../components/skill-type-badge";
import type { Link } from "../../helpers";
import { s } from "../../styles";

/** One skill in the agent's Skills tab: switch, drag handle, reorder and detach controls. */
export function SkillRow({
  skill,
  link,
  active,
  dragging,
  draggable,
  position,
  activeCount,
  canReorder,
  pending,
  onToggle,
  onMove,
  onDetach,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  skill: Skill;
  link: Link | undefined;
  active: boolean;
  dragging: boolean;
  draggable: boolean;
  /** Index among the agent's enabled skills (-1 when this one is off). */
  position: number;
  activeCount: number;
  canReorder: boolean;
  pending: boolean;
  onToggle: (on: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onDetach: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}) {
  const t = useTranslations("agents");
  const upDisabled = !canReorder || position === 0;
  const downDisabled = !canReorder || position === activeCount - 1;

  return (
    <article
      data-testid={`skill-row-${skill.id}`}
      style={s.row(active, skill.enabled, dragging)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span
        aria-hidden="true"
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", skill.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        style={s.grip(draggable)}
      >
        {active && <Icon.Menu size={14} />}
      </span>
      <span role="group" aria-label={t("skills.enableFor", { name: skill.name })} style={s.switch}>
        {/* The vendored Toggle has no `disabled`; ignore clicks while a save is in flight
            so overlapping saves cannot drop each other's change. */}
        <Toggle on={active} onChange={(on) => !pending && onToggle(on)} size={15} />
      </span>
      <span className="mono" style={s.skillName} title={skill.description}>
        {skill.name}
      </span>
      <SkillTypeBadge type={skill.type} label={t(`skills.type.${skill.type}`)} />
      <div style={s.controls}>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("skills.globalDisabled")}</Badge>}
        {active && (
          <>
            <button
              type="button"
              aria-label={t("skills.moveUp")}
              title={t("skills.moveUp")}
              onClick={() => onMove(-1)}
              disabled={upDisabled}
              style={s.iconButton(upDisabled)}
            >
              <Icon.ArrowUp size={14} />
            </button>
            <button
              type="button"
              aria-label={t("skills.moveDown")}
              title={t("skills.moveDown")}
              onClick={() => onMove(1)}
              disabled={downDisabled}
              style={s.iconButton(downDisabled)}
            >
              <Icon.ArrowDown size={14} />
            </button>
          </>
        )}
        {link && (
          <button
            type="button"
            aria-label={t("skills.detach", { name: skill.name })}
            title={t("skills.detach", { name: skill.name })}
            onClick={onDetach}
            disabled={pending}
            style={s.iconButton(pending)}
          >
            <Icon.X size={14} />
          </button>
        )}
      </div>
    </article>
  );
}
