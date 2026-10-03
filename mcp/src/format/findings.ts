import type { FindingRecord, ReviewRecord, RunSummary, Severity } from '@devdigest/shared';
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

export interface ShapedReview extends Record<string, unknown> {
  agent_id: string | null;
  agent_name: string | null;
  verdict: ReviewRecord['verdict'];
  score: number | null;
  cost_usd: number | null;
  /** Non-dismissed findings, before `minSeverity` and the per-review cap. */
  total_findings: number;
  findings: ShapedFinding[];
  truncated: boolean;
}

export interface ShapedPrFindings extends Record<string, unknown> {
  repo: string;
  prNumber: number;
  total_findings: number;
  counts: FindingsCounts;
  reviews: ShapedReview[];
  in_progress: Array<{ agent_name: string | null }>;
  failed: Array<{ agent_name: string | null; error: string | null }>;
  truncated: boolean;
  hint?: string;
}

export interface ShapePrFindingsOptions {
  repo: string;
  prNumber: number;
  format?: FindingsResponseFormat;
  minSeverity?: Severity;
  /** Per review. */
  limit?: number;
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

/** First (= newest, the API returns newest-first) item per agent; an item
 *  with a null `agent_id` is kept on its own. */
function latestPerAgent<T extends { agent_id: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (item.agent_id !== null) {
      if (seen.has(item.agent_id)) continue;
      seen.add(item.agent_id);
    }
    out.push(item);
  }
  return out;
}

function hintFor(
  inProgress: ShapedPrFindings['in_progress'],
  failed: ShapedPrFindings['failed'],
  reviewCount: number,
  truncated: boolean,
): string | undefined {
  if (inProgress.length > 0) {
    return `${inProgress.length} run(s) still in progress — call get_findings again in ~15s.`;
  }
  if (failed.length > 0) {
    const reason = failed[0]?.error ? ` (${failed[0].error})` : '';
    const more = failed.length > 1 ? ` [+${failed.length - 1} more failed run(s)]` : '';
    return `Run failed${reason} — check the provider key and retry.${more}`;
  }
  if (reviewCount === 0) return 'No reviews yet — start one with run_agent_on_pr.';
  if (truncated) return 'Response was truncated to fit the size budget — narrow with minSeverity or a smaller limit.';
  return undefined;
}

function shapeReview(
  review: ReviewRecord,
  options: { format: FindingsResponseFormat; limit: number; minRank: number | undefined; budget: number },
): ShapedReview {
  const open = review.findings.filter((f) => !isDismissed(f));
  const filtered = options.minRank === undefined ? open : open.filter((f) => SEVERITY_RANK[f.severity] <= options.minRank!);
  const sorted = [...filtered].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence,
  );
  const capped = sorted.slice(0, options.limit);
  const fitted = fitToBudget(
    capped.map((f) => shapeOne(f, options.format)),
    options.budget,
  );
  return {
    agent_id: review.agent_id,
    agent_name: review.agent_name ?? null,
    verdict: review.verdict,
    score: review.score,
    cost_usd: review.cost_usd ?? null,
    total_findings: open.length,
    findings: fitted.items,
    truncated: fitted.truncated || sorted.length > capped.length,
  };
}

/**
 * Shapes a PR's reviews + run history into `get_findings`'s response: the
 * latest `kind:'review'` per agent, each with its non-dismissed findings
 * (filtered by `minSeverity`, sorted severity then confidence, capped per
 * review, fitted to a per-review share of the text budget), plus the agents
 * whose newest run is still running or failed without a newer review.
 */
export function shapePrFindings(
  reviews: ReviewRecord[],
  runs: RunSummary[],
  options: ShapePrFindingsOptions,
): ShapedPrFindings {
  const format = options.format ?? 'concise';
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? FINDINGS_DEFAULT_LIMIT), 1), FINDINGS_MAX_LIMIT);
  const minRank = options.minSeverity ? SEVERITY_RANK[options.minSeverity] : undefined;

  const latestReviews = latestPerAgent(reviews.filter((r) => r.kind === 'review'));
  const budget = Math.floor(MAX_TEXT_CHARS / Math.max(latestReviews.length, 1));
  const shaped = latestReviews.map((r) => shapeReview(r, { format, limit, minRank, budget }));

  const counts: FindingsCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const r of latestReviews) {
    const c = countBySeverity(r.findings.filter((x) => !isDismissed(x)));
    counts.CRITICAL += c.CRITICAL;
    counts.WARNING += c.WARNING;
    counts.SUGGESTION += c.SUGGESTION;
  }

  const inProgress: ShapedPrFindings['in_progress'] = [];
  const failed: ShapedPrFindings['failed'] = [];
  for (const run of latestPerAgent(runs)) {
    if (run.status === 'running') {
      inProgress.push({ agent_name: run.agent_name });
    } else if (run.status === 'failed') {
      const newerReview = latestReviews.some(
        (r) => r.agent_id === run.agent_id && run.agent_id !== null && run.ran_at !== null && r.created_at > run.ran_at,
      );
      if (!newerReview) failed.push({ agent_name: run.agent_name, error: run.error });
    }
  }

  const truncated = shaped.some((r) => r.truncated);
  const result: ShapedPrFindings = {
    repo: options.repo,
    prNumber: options.prNumber,
    total_findings: shaped.reduce((n, r) => n + r.total_findings, 0),
    counts,
    reviews: shaped,
    in_progress: inProgress,
    failed,
    truncated,
  };
  const hint = hintFor(inProgress, failed, shaped.length, truncated);
  if (hint) result.hint = hint;
  return result;
}
