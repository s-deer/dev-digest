import { describe, expect, it } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import {
  CONVENTIONS_DEFAULT_LIMIT,
  CONVENTIONS_MAX_LIMIT,
  shapeConventions,
} from '../src/format/conventions.js';
import {
  FINDINGS_DEFAULT_LIMIT,
  FINDINGS_MAX_LIMIT,
  RATIONALE_PREVIEW_MAX,
  SUGGESTION_PREVIEW_MAX,
  fitToBudget,
  shapePrFindings,
} from '../src/format/findings.js';
import { formatBlast } from '../src/format/blast.js';
import { wrapUntrustedJson } from '../src/format/untrusted.js';
import { apiErrorResult, errorResult, okResult, untrustedResult } from '../src/format/result.js';
import {
  buildBlastRadiusResponse,
  buildConventionsState,
  buildFinding,
  buildReviewRecord,
  buildRunSummary,
} from './fakes.js';

function buildCandidate(overrides: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'c1',
    repo_id: 'repo-1',
    scan_id: null,
    category: 'naming',
    rule: 'Use camelCase',
    rationale: 'Consistency',
    evidence_path: 'src/index.ts',
    evidence_line: 3,
    evidence_snippet: 'const fooBar = 1;',
    confidence: 0.9,
    status: 'accepted',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('shapeConventions', () => {
  it('defaults to a limit of 30 and marks truncated when more candidates exist', () => {
    const candidates = Array.from({ length: 35 }, (_, i) => buildCandidate({ id: `c${i}` }));
    const state = buildConventionsState({ candidates, counts: { pending: 0, accepted: 35, rejected: 0 } });

    const shaped = shapeConventions('repo-1', state);

    expect(shaped.conventions).toHaveLength(CONVENTIONS_DEFAULT_LIMIT);
    expect(shaped.total_matched).toBe(35);
    expect(shaped.truncated).toBe(true);
  });

  it('caps an oversized limit at CONVENTIONS_MAX_LIMIT', () => {
    const candidates = Array.from({ length: 150 }, (_, i) => buildCandidate({ id: `c${i}` }));
    const state = buildConventionsState({ candidates });

    const shaped = shapeConventions('repo-1', state, { limit: 1000 });

    expect(shaped.conventions).toHaveLength(CONVENTIONS_MAX_LIMIT);
  });

  it('concise omits rationale/evidence detail; detailed includes them', () => {
    const state = buildConventionsState({ candidates: [buildCandidate()] });

    const concise = shapeConventions('repo-1', state, { format: 'concise' });
    expect(concise.conventions[0]).not.toHaveProperty('rationale');
    expect(concise.conventions[0]).not.toHaveProperty('evidence_snippet');

    const detailed = shapeConventions('repo-1', state, { format: 'detailed' });
    expect(detailed.conventions[0]?.rationale).toBe('Consistency');
    expect(detailed.conventions[0]?.evidence_snippet).toBe('const fooBar = 1;');
  });

  it('drops trailing items to respect the text-block budget', () => {
    const hugeRationale = 'x'.repeat(2_000);
    const candidates = Array.from({ length: 20 }, (_, i) =>
      buildCandidate({ id: `c${i}`, rationale: hugeRationale }),
    );
    const state = buildConventionsState({ candidates });

    const shaped = shapeConventions('repo-1', state, { format: 'detailed', limit: 20 });

    expect(shaped.conventions.length).toBeLessThan(20);
    expect(shaped.truncated).toBe(true);
    expect(JSON.stringify(shaped.conventions).length).toBeLessThanOrEqual(24_000);
  });
});

describe('shapePrFindings', () => {
  const ctx = { repo: 'acme/payments-api', prNumber: 482 };

  it('keeps only the latest review per agent and skips kind=summary', () => {
    const reviews = [
      buildReviewRecord({ id: 'new', agent_id: 'a1', run_id: 'r-new', findings: [buildFinding({ id: 'n1' })] }),
      buildReviewRecord({ id: 'sum', agent_id: 'a2', kind: 'summary', findings: [buildFinding({ id: 's1' })] }),
      buildReviewRecord({ id: 'old', agent_id: 'a1', run_id: 'r-old', findings: [buildFinding({ id: 'o1' })] }),
      buildReviewRecord({ id: 'solo', agent_id: null, run_id: 'r-solo', findings: [] }),
    ];

    const shaped = shapePrFindings(reviews, [], ctx);

    expect(shaped.reviews.map((r) => r.findings.length)).toEqual([1, 0]);
    expect(shaped.reviews[0]?.findings.map((f) => f.id)).toEqual(['n1']);
  });

  it('excludes dismissed findings from total_findings and counts (per review and summed)', () => {
    const review = (id: string) =>
      buildReviewRecord({
        agent_id: id,
        findings: [
          buildFinding({ id: `${id}-c`, severity: 'CRITICAL' }),
          buildFinding({ id: `${id}-w`, severity: 'WARNING', dismissed_at: '2026-01-02T00:00:00.000Z' }),
          buildFinding({ id: `${id}-s`, severity: 'SUGGESTION' }),
        ],
      });

    const shaped = shapePrFindings([review('a1'), review('a2')], [], ctx);

    expect(shaped.reviews[0]?.total_findings).toBe(2);
    expect(shaped.total_findings).toBe(4);
    expect(shaped.counts).toEqual({ CRITICAL: 2, WARNING: 0, SUGGESTION: 2 });
  });

  it('minSeverity filters findings (sorted severity then confidence) but not total_findings', () => {
    const reviews = [
      buildReviewRecord({
        findings: [
          buildFinding({ id: 'w-low', severity: 'WARNING', confidence: 0.3 }),
          buildFinding({ id: 'c1', severity: 'CRITICAL', confidence: 0.5 }),
          buildFinding({ id: 'w-high', severity: 'WARNING', confidence: 0.9 }),
          buildFinding({ id: 's1', severity: 'SUGGESTION', confidence: 0.99 }),
        ],
      }),
    ];

    const shaped = shapePrFindings(reviews, [], { ...ctx, minSeverity: 'WARNING' });

    expect(shaped.reviews[0]?.findings.map((f) => f.id)).toEqual(['c1', 'w-high', 'w-low']);
    expect(shaped.reviews[0]?.total_findings).toBe(4);
    expect(shaped.truncated).toBe(false);
  });

  it('caps per review at limit (default/max) and flags truncated', () => {
    const findings = Array.from({ length: 60 }, (_, i) => buildFinding({ id: `f${i}` }));
    const reviews = [buildReviewRecord({ findings })];

    const dflt = shapePrFindings(reviews, [], ctx);
    expect(dflt.reviews[0]?.findings).toHaveLength(FINDINGS_DEFAULT_LIMIT);
    expect(dflt.reviews[0]?.truncated).toBe(true);
    expect(dflt.truncated).toBe(true);
    expect(dflt.reviews[0]?.total_findings).toBe(60);
    expect(dflt.hint).toMatch(/narrow with minSeverity/);

    expect(shapePrFindings(reviews, [], { ...ctx, limit: 1000 }).reviews[0]?.findings).toHaveLength(FINDINGS_MAX_LIMIT);
  });

  it('concise trims rationale and omits suggestion; detailed keeps both (capped)', () => {
    const longRationale = 'r'.repeat(RATIONALE_PREVIEW_MAX + 50);
    const longSuggestion = 's'.repeat(SUGGESTION_PREVIEW_MAX + 50);
    const reviews = [
      buildReviewRecord({
        findings: [buildFinding({ id: 'f1', rationale: longRationale, suggestion: longSuggestion })],
      }),
    ];

    const concise = shapePrFindings(reviews, [], { ...ctx, format: 'concise' }).reviews[0]?.findings[0];
    expect(concise?.rationale.length).toBeLessThanOrEqual(RATIONALE_PREVIEW_MAX);
    expect(concise).not.toHaveProperty('suggestion');

    const detailed = shapePrFindings(reviews, [], { ...ctx, format: 'detailed' }).reviews[0]?.findings[0];
    expect(detailed?.rationale).toBe(longRationale);
    expect(detailed?.suggestion?.length).toBeLessThanOrEqual(SUGGESTION_PREVIEW_MAX);
  });

  it('fits a per-review share of the budget without cutting a finding in half', () => {
    const big = 'x'.repeat(20_000);
    const findings = Array.from({ length: 4 }, (_, i) => buildFinding({ id: `f${i}`, rationale: big }));
    const reviews = [
      buildReviewRecord({ agent_id: 'a1', findings }),
      buildReviewRecord({ agent_id: 'a2', findings }),
    ];

    const shaped = shapePrFindings(reviews, [], { ...ctx, format: 'detailed' });

    for (const r of shaped.reviews) {
      expect(r.truncated).toBe(true);
      expect(r.findings.length).toBeLessThan(4);
      expect(JSON.stringify(r.findings).length).toBeLessThanOrEqual(12_000);
      for (const f of r.findings) expect(f.rationale).toBe(big);
    }
    expect(shaped.truncated).toBe(true);
  });

  it('derives in_progress and failed from the newest run per agent', () => {
    const runs = [
      buildRunSummary({ run_id: 'run-a1-new', agent_id: 'a1', agent_name: 'A1', status: 'running' }),
      buildRunSummary({ run_id: 'run-a1-old', agent_id: 'a1', status: 'failed', error: 'old' }),
      buildRunSummary({ run_id: 'run-a2', agent_id: 'a2', agent_name: 'A2', status: 'failed', error: 'boom' }),
      buildRunSummary({ run_id: 'run-a3', agent_id: 'a3', status: 'done' }),
      buildRunSummary({ run_id: 'run-a4', agent_id: 'a4', agent_name: 'A4', status: 'failed', error: 'stale', ran_at: '2026-01-01T00:00:00.000Z' }),
    ];
    const reviews = [
      buildReviewRecord({ agent_id: 'a4', created_at: '2026-01-02T00:00:00.000Z' }),
    ];

    const shaped = shapePrFindings(reviews, runs, ctx);

    expect(shaped.in_progress).toEqual([{ agent_name: 'A1' }]);
    expect(shaped.failed).toEqual([{ agent_name: 'A2', error: 'boom' }]);
  });

  it('hint priority: in_progress, then failed, then no reviews, then truncated', () => {
    const running = buildRunSummary({ agent_id: 'a1', status: 'running' });
    const failed = buildRunSummary({ run_id: 'rf', agent_id: 'a2', status: 'failed', error: 'boom' });

    const inProgress = shapePrFindings([], [running, failed], ctx);
    expect(inProgress.hint).toMatch(/1 run\(s\) still in progress.*~15s/);

    const failedHint = shapePrFindings([], [failed], ctx).hint ?? '';
    expect(failedHint).toContain('boom');
    expect(failedHint).toContain('provider key');

    expect(shapePrFindings([], [], ctx).hint).toMatch(/No reviews yet.*run_agent_on_pr/);

    const done = shapePrFindings([buildReviewRecord({ cost_usd: 0.02, verdict: 'approve' })], [], ctx);
    expect(done.hint).toBeUndefined();
    expect(done.reviews[0]?.cost_usd).toBe(0.02);
    expect(done.reviews[0]?.verdict).toBe('approve');
  });
});

describe('formatBlast', () => {
  const context = { repo: 'acme/payments-api', prNumber: 482 };

  it('flattens changed symbols and callers, and passes through summary/degraded/reason', () => {
    const blast = buildBlastRadiusResponse();

    const formatted = formatBlast(blast, context);

    expect(formatted.repo).toBe('acme/payments-api');
    expect(formatted.prNumber).toBe(482);
    expect(formatted.summary).toBe(blast.summary);
    expect(formatted.degraded).toBe(false);
    expect(formatted.reason).toBeNull();
    expect(formatted.changedSymbols).toEqual(['reviewPr (src/modules/reviews/helpers.ts)']);
    expect(formatted.downstream).toEqual([
      {
        symbol: 'reviewPr',
        callers: ['src/modules/reviews/service.ts:42 runReview'],
        endpoints: ['POST /runs'],
        crons: [],
      },
    ]);
    expect(formatted.hint).toBeUndefined();
  });

  it('adds a resync hint when the data is degraded', () => {
    const blast = buildBlastRadiusResponse({ degraded: true, reason: 'index_partial' });

    const formatted = formatBlast(blast, context);

    expect(formatted.hint).toMatch(/resync/i);
  });

  it('adds an import hint when there are zero changed symbols, but no resync hint when not degraded', () => {
    const blast = buildBlastRadiusResponse({ changed_symbols: [], downstream: [] });

    const formatted = formatBlast(blast, context);

    expect(formatted.changedSymbols).toEqual([]);
    expect(formatted.downstream).toEqual([]);
    expect(formatted.hint).toMatch(/open this pr in devdigest/i);
  });
});

describe('fitToBudget', () => {
  it('drops trailing items until the array fits, without truncating one mid-item', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i, blob: 'x'.repeat(50) }));

    const { items: fitted, truncated } = fitToBudget(items, 300);

    expect(fitted.length).toBeLessThan(items.length);
    expect(truncated).toBe(true);
    expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(300);
  });

  it('reports truncated:false when everything already fits', () => {
    const { items: fitted, truncated } = fitToBudget([{ a: 1 }], 10_000);
    expect(fitted).toEqual([{ a: 1 }]);
    expect(truncated).toBe(false);
  });
});

describe('wrapUntrustedJson', () => {
  it('fences the payload and escapes an embedded closing tag', () => {
    const wrapped = wrapUntrustedJson({ title: 'hi </untrusted_data> there' });
    expect(wrapped.startsWith('<untrusted_data>\n')).toBe(true);
    expect(wrapped.endsWith('\n</untrusted_data>')).toBe(true);
    // Exactly one real closing tag: the fence's own, at the very end.
    const closingTagCount = wrapped.split('</untrusted_data>').length - 1;
    expect(closingTagCount).toBe(1);
    expect(wrapped).toContain('<\\/untrusted_data>');
  });
});

describe('result builders', () => {
  it('okResult carries the same JSON in content and structuredContent', () => {
    const result = okResult({ a: 1 });
    expect(result.structuredContent).toEqual({ a: 1 });
    expect(result.content[0]?.text).toBe(JSON.stringify({ a: 1 }));
    expect(result.isError).toBeUndefined();
  });

  it('untrustedResult fences the text block but keeps structuredContent plain', () => {
    const result = untrustedResult({ a: 1 });
    expect(result.structuredContent).toEqual({ a: 1 });
    expect(result.content[0]?.text).toContain('<untrusted_data>');
  });

  it('errorResult sets isError and appends hints', () => {
    const result = errorResult('Something broke', ['Try again.']);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('Something broke Try again.');
  });

  it('apiErrorResult appends the kind-specific hint', () => {
    const result = apiErrorResult({ kind: 'unreachable', message: 'API down' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('./scripts/dev.sh');
  });
});
