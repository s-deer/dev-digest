import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
