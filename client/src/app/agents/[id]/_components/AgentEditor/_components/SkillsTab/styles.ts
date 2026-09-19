import type { CSSProperties } from "react";
import type { SkillType } from "@devdigest/shared";

const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

const TYPE_BACKGROUNDS: Record<SkillType, string> = {
  rubric: "var(--accent-bg)",
  convention: "var(--ok-bg)",
  security: "var(--crit-bg)",
  custom: "var(--bg-hover)",
};

export const s = {
  wrap: { maxWidth: 680 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  filter: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, width: 200, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: { minWidth: 0, flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" } satisfies CSSProperties,
  hint: { fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)", margin: "0 0 14px" } satisfies CSSProperties,
  list: { display: "grid", gap: 6 } satisfies CSSProperties,
  row: (attached: boolean, globallyEnabled: boolean, dragging: boolean): CSSProperties => ({
    display: "flex",
    gap: 11,
    alignItems: "center",
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: attached ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: globallyEnabled ? (dragging ? 0.55 : 1) : 0.7,
  }),
  grip: { display: "inline-flex", width: 14, color: "var(--text-muted)", cursor: "grab", flexShrink: 0 } satisfies CSSProperties,
  checkbox: (checked: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: 4,
    border: `1.5px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
    background: checked ? "var(--accent)" : "transparent",
    display: "grid",
    placeItems: "center",
    padding: 0,
    flexShrink: 0,
  }),
  skillName: { fontSize: 12.5, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  controls: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end" } satisfies CSSProperties,
  toggleLabel: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  iconButton: (disabled: boolean): CSSProperties => ({
    display: "grid",
    placeItems: "center",
    width: 24,
    height: 24,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    borderRadius: 5,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  }),
  typeColor: (type: SkillType) => TYPE_COLORS[type],
  typeBackground: (type: SkillType) => TYPE_BACKGROUNDS[type],
} as const;
