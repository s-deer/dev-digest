import type { CSSProperties } from "react";

export const s = {
  form: { display: "grid", gap: 4 } satisfies CSSProperties,
  bodyTabs: { display: "flex", gap: 4 } satisfies CSSProperties,
  preview: {
    minHeight: 220,
    maxHeight: 420,
    overflow: "auto",
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
