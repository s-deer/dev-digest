/* Findings support for the DiffViewer (Files changed tab). Pure helpers that
   match the latest review's kept findings to rendered diff lines — mirrors
   comments.ts's line-matching rule (RIGHT:<line>, the new-file side, since
   findings are always given against the new code). */
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { keysForLine, lineKey } from "./comments";
import type { Line } from "./helpers";

/** What the viewer needs to render the latest review's findings inline
   (Files changed tab): which findings belong to which file, whether the
   cards are shown (the same Show/Hide toggle as comments), and accept/dismiss. */
export interface DiffFindingsApi {
  byPath: Map<string, FindingRecord[]>;
  show: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  pending: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** The findings anchored to this parsed line: its RIGHT key must equal
   `RIGHT:${finding.start_line}`. */
export function findingsForLine(ln: Line, findings: FindingRecord[]): FindingRecord[] {
  if (findings.length === 0) return [];
  const keys = new Set(keysForLine(ln));
  return findings.filter((f) => {
    const key = lineKey("RIGHT", f.start_line);
    return !!key && keys.has(key);
  });
}

/**
 * Split a file's findings into those anchored to a rendered line and those
 * that aren't (the line isn't in this patch) — the latter go to the
 * end-of-file "Findings outside the diff" block, so nothing is silently
 * dropped.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: FindingRecord[]; outside: FindingRecord[] } {
  const matched: FindingRecord[] = [];
  const outside: FindingRecord[] = [];
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (key && renderedKeys.has(key)) matched.push(f);
    else outside.push(f);
  }
  return { matched, outside };
}

/** The most severe finding among these (CRITICAL > WARNING > SUGGESTION), or
   null for an empty list. */
export function topSeverity(findings: FindingRecord[]): Severity | null {
  if (findings.length === 0) return null;
  let top = findings[0]!.severity;
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[top]) top = f.severity;
  }
  return top;
}
