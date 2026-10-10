/* Pure helpers for BriefCard — no React. */
import type { BriefFacts, BriefGrounding } from "@devdigest/shared";

/** Keys of the `brief.fact.*` messages, one per missing input. */
export type FactKey =
  | "intent"
  | "intentStale"
  | "blast"
  | "linkedIssue"
  | "description"
  | "noAgent"
  | "specsUnavailable"
  | "noSpecs";

/** Which inputs were not available when the brief was generated, in display
   order. A present input is never listed. */
export function missingFactKeys(facts: BriefFacts): FactKey[] {
  const out: FactKey[] = [];
  if (facts.intent === "missing") out.push("intent");
  if (facts.intent === "stale") out.push("intentStale");
  if (facts.blast.status !== "present") out.push("blast");
  if (facts.linked_issue === "none") out.push("linkedIssue");
  if (facts.description === "empty") out.push("description");
  if (facts.specs.status === "no_agent") out.push("noAgent");
  else if (facts.specs.status === "unavailable") out.push("specsUnavailable");
  else if (facts.specs.status === "none_attached") out.push("noSpecs");
  return out;
}

/** True when the grounding gate removed anything the user should hear about. */
export function hasRemovedItems(g: BriefGrounding): boolean {
  return g.risks_dropped + g.focus_dropped > 0;
}

/** Severity → colour token (icon colour; the text label carries the meaning). */
export const SEVERITY_COLOR = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
} as const;
