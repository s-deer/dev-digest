import type { CSSProperties } from "react";
import { STICKY_TOP_OFFSET } from "../../../../constants";

/* Plain row (diff.jsx:122-126) — no border, no card look. The background
   stays opaque (the page background, not transparent) purely so the group's
   own files don't show through it while it's stuck to the top of the
   viewport; it is not meant to read as a card. */
export const s = {
  header: {
    position: "sticky",
    top: STICKY_TOP_OFFSET,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "6px 0",
    marginBottom: 8,
    background: "var(--bg-primary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  label: { fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 } satisfies CSSProperties,
  hint: {
    fontSize: 11.5,
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
    fontSize: 11,
    fontWeight: 600,
    color: "var(--crit)",
  } satisfies CSSProperties,
  dot: { width: 7, height: 7, borderRadius: "50%", background: "var(--crit)", flexShrink: 0 } satisfies CSSProperties,
  filesCount: {
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
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
  return { width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 };
}
