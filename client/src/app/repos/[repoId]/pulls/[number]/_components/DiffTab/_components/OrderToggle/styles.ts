import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;

/** One segment of the toggle — active gets the elevated background + primary
   text; inactive stays muted (diff.jsx:113-116). */
export function buttonFor(active: boolean): CSSProperties {
  return {
    padding: "3px 11px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    background: active ? "var(--bg-elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    cursor: "pointer",
  };
}
