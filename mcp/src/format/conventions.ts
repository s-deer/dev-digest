import type { ConventionCandidate, ConventionsState } from '@devdigest/shared';

export const CONVENTIONS_DEFAULT_LIMIT = 30;
export const CONVENTIONS_MAX_LIMIT = 100;
/** Text-block budget shared by every tool response (see cross-cutting rules). */
export const MAX_TEXT_CHARS = 24_000;

export type ConventionsResponseFormat = 'concise' | 'detailed';

export interface ShapedConvention extends Record<string, unknown> {
  id: string;
  category: ConventionCandidate['category'];
  rule: string;
  status: ConventionCandidate['status'];
  confidence: number;
  evidence_path: string;
  rationale?: string | null;
  evidence_line?: number | null;
  evidence_snippet?: string;
}

export interface ShapedConventions extends Record<string, unknown> {
  repo_id: string;
  counts: ConventionsState['counts'];
  conventions: ShapedConvention[];
  total_matched: number;
  truncated: boolean;
}

function shapeOne(c: ConventionCandidate, format: ConventionsResponseFormat): ShapedConvention {
  const base: ShapedConvention = {
    id: c.id,
    category: c.category,
    rule: c.rule,
    status: c.status,
    confidence: c.confidence,
    evidence_path: c.evidence_path,
  };
  if (format === 'detailed') {
    return {
      ...base,
      rationale: c.rationale,
      evidence_line: c.evidence_line,
      evidence_snippet: c.evidence_snippet,
    };
  }
  return base;
}

/**
 * Trims a `ConventionsState` (already status-filtered by the caller) to a
 * client-shown shape, respecting `limit` (default 30, max 100) and the
 * shared `MAX_TEXT_CHARS` text-block budget.
 */
export function shapeConventions(
  repoId: string,
  state: ConventionsState,
  options: { format?: ConventionsResponseFormat; limit?: number } = {},
): ShapedConventions {
  const format = options.format ?? 'concise';
  const requestedLimit = options.limit ?? CONVENTIONS_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), CONVENTIONS_MAX_LIMIT);

  const totalMatched = state.candidates.length;
  let conventions = state.candidates.slice(0, limit).map((c) => shapeOne(c, format));
  let truncated = totalMatched > conventions.length;

  // Enforce the character budget even after limiting by count: drop trailing
  // items rather than truncate one mid-item.
  while (conventions.length > 0 && JSON.stringify(conventions).length > MAX_TEXT_CHARS) {
    conventions = conventions.slice(0, -1);
    truncated = true;
  }

  return { repo_id: repoId, counts: state.counts, conventions, total_matched: totalMatched, truncated };
}
