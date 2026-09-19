import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "grid", gap: 16 } satisfies CSSProperties,
  trust: {
    display: "flex",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  trustTitle: { fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 } satisfies CSSProperties,
  picker: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13, margin: 0 } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  rendered: {
    maxHeight: 340,
    overflow: "auto",
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  ignored: { margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  sectionTitle: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
} as const;
