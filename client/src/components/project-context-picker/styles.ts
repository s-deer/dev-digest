import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextPicker and its rows. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  row: (checked: boolean, dragging: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: checked ? "var(--bg-hover)" : "var(--bg-surface)",
      opacity: dragging ? 0.5 : 1,
    }) satisfies CSSProperties,
  handle: { color: "var(--text-muted)", cursor: "grab", display: "inline-flex" } satisfies CSSProperties,
  checkbox: { width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  folder: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  warn: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  moveBtn: (off: boolean) =>
    ({
      display: "inline-grid",
      placeItems: "center",
      background: "none",
      border: "none",
      cursor: off ? "not-allowed" : "pointer",
      color: "var(--text-secondary)",
      opacity: off ? 0.4 : 1,
    }) satisfies CSSProperties,
  actions: { display: "inline-flex", alignItems: "center", gap: 4 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "8px 2px" } satisfies CSSProperties,
  dialogFocus: { outline: "none" } satisfies CSSProperties,
  previewBody: { padding: "16px 20px", fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  previewMeta: { fontSize: 12, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
} as const;
