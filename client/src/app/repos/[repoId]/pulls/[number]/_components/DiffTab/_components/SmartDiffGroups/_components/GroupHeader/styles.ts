import type { CSSProperties } from "react";
import { STICKY_TOP_OFFSET } from "../../../../constants";

export const s = {
  header: {
    position: "sticky",
    top: STICKY_TOP_OFFSET,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
  } satisfies CSSProperties,
  label: { fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 } satisfies CSSProperties,
  hint: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  right: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  countWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crit)",
  } satisfies CSSProperties,
  dot: { width: 7, height: 7, borderRadius: "50%", background: "var(--crit)", flexShrink: 0 } satisfies CSSProperties,
  filesCount: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}

export function colorSquareFor(color: string): CSSProperties {
  return { width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 };
}
