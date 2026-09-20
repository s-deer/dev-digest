import type { CSSProperties } from "react";

export const s = {
  sidebar: {
    width: 340,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    minHeight: 0,
  } satisfies CSSProperties,
  header: { padding: "14px 14px 10px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  title: { flex: 1, margin: 0, fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 10px 10px" } satisfies CSSProperties,
  noMatch: { margin: "20px 8px", fontSize: 12.5, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
} as const;
