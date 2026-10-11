/* Pure helpers for BriefCard — no React. */
import type { BriefFacts, BriefGrounding, BriefRiskRecord, ReviewRecord } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

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

/** Newest review that carries a verdict. A newer review without one (e.g. a
   summary run) does not hide an older verdict. `null` when none has one. */
export function pickVerdictReview(reviews: ReviewRecord[] | undefined | null): ReviewRecord | null {
  if (!reviews) return null;
  const sorted = [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted.find((r) => r.verdict != null) ?? null;
}

/** "N findings · M blockers" inputs; blockers = open CRITICAL findings (the
   same rule as ReviewRunAccordion). */
export function reviewCounts(review: ReviewRecord): { findings: number; blockers: number } {
  return {
    findings: review.findings.length,
    blockers: review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}

const RISK_ICON_NAMES = new Map<string, IconName>([
  ["security", "Shield"],
  ["db_migration", "Database"],
  ["breaking_api", "AlertOctagon"],
  ["perf", "Zap"],
  ["deps", "Boxes"],
]);

/** Icon for a risk `kind`. Exact match against the fixed set; anything else
   (including model-invented kinds and prototype names) gets the fallback. */
export function iconNameForKind(kind: string): IconName {
  return RISK_ICON_NAMES.get(kind) ?? "AlertTriangle";
}

/** `file` or `file:line` for a risk's first file ref; missing and null line
   are the same (briefs stored before revision 2 have no line). */
export function riskRef(risk: BriefRiskRecord): string {
  const file = risk.file_refs[0] ?? "";
  return typeof risk.line === "number" ? `${file}:${risk.line}` : file;
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
