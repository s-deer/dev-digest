import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", flex: 1, minHeight: 0, height: "100%" } satisfies CSSProperties,
  listCol: {
    width: 340,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
    minHeight: 0,
  } satisfies CSSProperties,
  listHead: { padding: "16px 16px 10px", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" } satisfies CSSProperties,
  listTitle: { margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  patterns: { margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  listScroll: { flex: 1, overflowY: "auto", padding: "0 8px 8px" } satisfies CSSProperties,
  footer: { borderTop: "1px solid var(--border)", padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", display: "grid", gap: 2 } satisfies CSSProperties,
  previewCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  state: { flex: 1, display: "grid", placeItems: "center", padding: 24 } satisfies CSSProperties,
} as const;
