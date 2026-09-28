import type { CSSProperties } from "react";
import type { BlastGraphNodeKind } from "./helpers";

/** Reuses the endpoint(info)/cron(warn) colors already established by
    SymbolImpact's chips, so the graph and tree views read as one palette. */
export const KIND_COLORS: Record<BlastGraphNodeKind, { fill: string; stroke: string; text: string }> = {
  symbol: { fill: "var(--bg-elevated)", stroke: "var(--accent)", text: "var(--text-primary)" },
  caller: { fill: "var(--bg-elevated)", stroke: "var(--border-strong)", text: "var(--text-secondary)" },
  endpoint: { fill: "var(--info-bg)", stroke: "var(--info)", text: "var(--text-primary)" },
  cron: { fill: "var(--warn-bg)", stroke: "var(--warn)", text: "var(--text-primary)" },
};

export const s = {
  scroller: {
    overflowX: "auto",
    marginTop: 4,
  } satisfies CSSProperties,

  svg: {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
  } satisfies CSSProperties,

  edge: {
    fill: "none",
    stroke: "var(--border)",
    strokeWidth: 1.25,
  } satisfies CSSProperties,

  nodeText: {
    fill: "var(--text-primary)",
    pointerEvents: "none",
  } satisfies CSSProperties,

  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
} as const;
