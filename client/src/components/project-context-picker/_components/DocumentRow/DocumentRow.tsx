/* DocumentRow — one document in the picker: attach checkbox, name, type badge,
   token cost, Preview, and (for attached rows) keyboard-accessible reordering. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { ProjectDocType } from "@devdigest/shared";
import { splitPath } from "../../helpers";
import { s } from "../../styles";

const TYPE_COLORS: Record<ProjectDocType, { color: string; bg: string }> = {
  specs: { color: "var(--accent-text)", bg: "var(--accent-bg, var(--bg-hover))" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg, var(--bg-hover))" },
  other: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

export interface DocumentRowProps {
  path: string;
  type: ProjectDocType | null;
  tokens: number;
  checked: boolean;
  missing: boolean;
  overCap: boolean;
  /** Inherited rows are shown ticked but cannot be changed here. */
  inheritedVia: string | null;
  /** Position among attached rows; null when the row cannot be reordered. */
  order: { index: number; count: number } | null;
  dragging: boolean;
  disabled: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onPreview: (trigger: HTMLElement) => void;
  onDetach: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

export function DocumentRow(p: DocumentRowProps) {
  const t = useTranslations("context");
  const { name, folder } = splitPath(p.path);
  const reorderable = p.order != null;
  const readOnly = p.inheritedVia != null;
  const checkboxName = readOnly
    ? t("picker.inheritedLabel", { path: p.path, skill: p.inheritedVia })
    : t("picker.select", { path: p.path });
  return (
    <li
      style={s.row(p.checked, p.dragging)}
      draggable={reorderable && !p.disabled}
      onDragStart={reorderable ? p.onDragStart : undefined}
      onDragOver={reorderable ? p.onDragOver : undefined}
      onDrop={reorderable ? p.onDrop : undefined}
    >
      <span style={s.handle} aria-hidden="true" title={reorderable ? t("picker.dragHandle", { path: p.path }) : undefined}>
        <Icon.Menu size={14} />
      </span>
      <input
        type="checkbox"
        style={s.checkbox}
        checked={p.checked}
        disabled={readOnly || p.disabled || p.missing}
        aria-label={checkboxName}
        onChange={p.onToggle}
      />
      <span className="mono" style={s.name}>
        {name}
      </span>
      {folder && (
        <span className="mono" style={s.folder}>
          {folder}
        </span>
      )}
      {p.inheritedVia != null && <Badge>{t("picker.inheritedVia", { skill: p.inheritedVia })}</Badge>}
      {p.missing && (
        <Badge color="var(--crit)" bg="var(--crit-bg)">
          {t("picker.missing")}
        </Badge>
      )}
      <span style={s.spacer} />
      {p.overCap && <span style={s.warn}>{t("picker.overCap")}</span>}
      {!p.missing && (
        <span className="tnum" style={s.meta}>
          {t("picker.tokens", { tokens: p.tokens })}
        </span>
      )}
      {p.type != null && (
        <Badge color={TYPE_COLORS[p.type].color} bg={TYPE_COLORS[p.type].bg}>
          {t(`picker.type.${p.type}`)}
        </Badge>
      )}
      <span style={s.actions}>
        {reorderable && p.order && (
          <>
            <button
              type="button"
              style={s.moveBtn(p.order.index === 0 || p.disabled)}
              aria-label={t("picker.moveUp", { path: p.path })}
              disabled={p.order.index === 0 || p.disabled}
              onClick={() => p.onMove(-1)}
            >
              <Icon.ArrowUp size={14} />
            </button>
            <button
              type="button"
              style={s.moveBtn(p.order.index === p.order.count - 1 || p.disabled)}
              aria-label={t("picker.moveDown", { path: p.path })}
              disabled={p.order.index === p.order.count - 1 || p.disabled}
              onClick={() => p.onMove(1)}
            >
              <Icon.ArrowDown size={14} />
            </button>
          </>
        )}
        {p.missing ? (
          <Button kind="ghost" size="sm" aria-label={t("picker.detachLabel", { path: p.path })} disabled={p.disabled} onClick={p.onDetach}>
            {t("picker.detach")}
          </Button>
        ) : (
          <Button
            kind="ghost"
            size="sm"
            icon="Eye"
            aria-label={t("picker.previewLabel", { path: p.path })}
            onClick={(e) => p.onPreview(e.currentTarget)}
          >
            {t("picker.preview")}
          </Button>
        )}
      </span>
    </li>
  );
}
