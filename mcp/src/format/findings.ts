import type { FindingRecord, RunDetail, Severity } from '@devdigest/shared';
import { MAX_TEXT_CHARS } from './conventions.js';

/** Same cutoff as `server/src/modules/reviews/findings-summary.ts` (see
 *  `docs/findings-read-model.md`) — concise rationale is a preview, not the
 *  full markdown. */
export const RATIONALE_PREVIEW_MAX = 240;
/** Detailed suggestions are markdown and can run long; cap them too. */
export const SUGGESTION_PREVIEW_MAX = 1000;
export const FINDINGS_DEFAULT_LIMIT = 20;
export const FINDINGS_MAX_LIMIT = 50;

export type FindingsResponseFormat = 'concise' | 'detailed';

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export interface FindingsCounts {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}

export interface ShapedFinding extends Record<string, unknown> {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale: string;
  suggestion?: string | null;
}

export interface ShapedFindings extends Record<string, unknown> {
  run_id: string;
  status: RunDetail['status'];
  cost_usd: number | null;
  verdict: RunDetail['verdict'];
  counts: FindingsCounts;
  findings: ShapedFinding[];
  next_cursor: number | null;
  truncated: boolean;
  hint?: string;
}

export interface ShapeFindingsOptions {
  format?: FindingsResponseFormat;
  minSeverity?: Severity;
  limit?: number;
  cursor?: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function isDismissed(f: FindingRecord): boolean {
  return f.dismissed_at != null;
}

function countBySeverity(findings: FindingRecord[]): FindingsCounts {
  const counts: FindingsCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

function shapeOne(f: FindingRecord, format: FindingsResponseFormat): ShapedFinding {
  const base: ShapedFinding = {
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    confidence: f.confidence,
    rationale: truncate(f.rationale, RATIONALE_PREVIEW_MAX),
  };
  if (format === 'detailed') {
    return {
      ...base,
      rationale: f.rationale,
      suggestion: f.suggestion ? truncate(f.suggestion, SUGGESTION_PREVIEW_MAX) : null,
    };
  }
  return base;
}

/** Drops trailing items until the JSON-serialized array fits `maxChars` —
 *  never truncates a single item mid-way. */
export function fitToBudget<T>(items: T[], maxChars: number): { items: T[]; truncated: boolean } {
  let out = items;
  let truncated = false;
  while (out.length > 0 && JSON.stringify(out).length > maxChars) {
    out = out.slice(0, -1);
    truncated = true;
  }
  return { items: out, truncated };
}

function hintFor(detail: RunDetail, truncated: boolean): string | undefined {
  if (detail.status === 'running') return 'Run is still in progress — call get_findings again in ~15s.';
  if (detail.status === 'failed') {
    const reason = detail.error ? ` (${detail.error})` : '';
    return `Run failed${reason} — check the provider key and retry.`;
  }
  if (truncated) return 'Response was truncated to fit the size budget — narrow with minSeverity or a smaller limit.';
  return undefined;
}

/**
 * Shapes a `RunDetail` into `get_findings`'s response: drops dismissed
 * findings, counts the rest by severity, filters by `minSeverity` (at least
 * this severe), sorts by severity then confidence (desc), pages with an
 * offset cursor, and fits the shared text-block budget by dropping trailing
 * items rather than truncating one mid-item.
 */
export function shapeFindings(detail: RunDetail, options: ShapeFindingsOptions = {}): ShapedFindings {
  const format = options.format ?? 'concise';
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? FINDINGS_DEFAULT_LIMIT), 1), FINDINGS_MAX_LIMIT);
  const cursor = Math.max(Math.trunc(options.cursor ?? 0), 0);

  const open = detail.findings.filter((f) => !isDismissed(f));
  const counts = countBySeverity(open);

  const minRank = options.minSeverity ? SEVERITY_RANK[options.minSeverity] : undefined;
  const filtered = minRank === undefined ? open : open.filter((f) => SEVERITY_RANK[f.severity] <= minRank);
  const sorted = [...filtered].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence,
  );

  const page = sorted.slice(cursor, cursor + limit);
  const fitted = fitToBudget(
    page.map((f) => shapeOne(f, format)),
    MAX_TEXT_CHARS,
  );
  const truncated = fitted.truncated || cursor + page.length < sorted.length;
  const nextCursor = cursor + fitted.items.length < sorted.length ? cursor + fitted.items.length : null;

  const result: ShapedFindings = {
    run_id: detail.run_id,
    status: detail.status,
    cost_usd: detail.cost_usd,
    verdict: detail.verdict,
    counts,
    findings: fitted.items,
    next_cursor: nextCursor,
    truncated,
  };
  const hint = hintFor(detail, truncated);
  if (hint) result.hint = hint;
  return result;
}
