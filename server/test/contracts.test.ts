import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  PrIntentRecord,
  PromptAssembly,
  GenerateIntentBody,
  SetProjectContextBody,
  ProjectContextRecord,
  BriefModelOutput,
  BriefRiskOut,
  BriefRiskRecord,
  PrBriefRecord,
} from '@devdigest/shared';
import { toJsonSchema } from '../src/platform/structured.js';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('SmartDiff with tests and docs groups (5-role enum)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'tests',
          files: [{ path: 'a.test.ts', additions: 10, deletions: 0, finding_lines: [] }],
        },
        {
          role: 'docs',
          files: [{ path: 'README.md', additions: 5, deletions: 1, finding_lines: [3] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 16, proposed_splits: [] },
    });
    expect(d.groups.map((g) => g.role)).toEqual(['tests', 'docs']);
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('Intent Layer (L03) contracts', () => {
  it('PrIntentRecord parses a full sample', () => {
    const record = PrIntentRecord.parse({
      intent: 'Add rate limiting to the public webhook endpoint.',
      in_scope: ['Add a token-bucket limiter middleware'],
      out_of_scope: ['Rewriting the webhook handler'],
      change_type: 'feature',
      confidence: 'high',
      confidence_score: 0.85,
      sources: [
        { kind: 'issue', ref: '#471', fetched: true, note: null },
        { kind: 'external_ref', ref: 'ABC-123', fetched: false, note: 'reference only — not fetched' },
      ],
      missing_docs: false,
      pr_id: 'pr_1',
      head_sha: 'a1b2c3d',
      stale: false,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 1200,
      tokens_out: 180,
      cost_usd: 0.002,
      cost_usd_total: 0.004,
      updated_at: '2026-09-26T00:00:00.000Z',
    });
    expect(record.confidence).toBe('high');
    expect(record.sources).toHaveLength(2);
  });

  it('PromptAssembly parses an old trace without intent', () => {
    const assembly = PromptAssembly.parse({ system: 's', user: 'u' });
    expect(assembly.intent).toBeUndefined();
  });

  it('GenerateIntentBody defaults force to false', () => {
    expect(GenerateIntentBody.parse({})).toEqual({ force: false });
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('Project Context contracts', () => {
  const baseTrace = {
    config: { agent: 'A', model: 'm' },
    stats: { duration_ms: 1, tokens_in: 0, tokens_out: 0, findings: 0, grounding: '0/0' },
    prompt_assembly: { system: 's', user: 'u' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: [],
  };

  it('an older trace (no project-context fields) parses to defaults', () => {
    const trace = RunTrace.parse(baseTrace);
    expect(trace.project_context).toEqual([]);
    expect(trace.prompt_assembly.project_specs).toBeUndefined();
    expect(trace.prompt_assembly.project_context_tokens).toBe(0);
    expect(trace.prompt_assembly.project_specs_tokens).toBe(0);
  });

  it('parses a trace with injected and skipped records', () => {
    const trace = RunTrace.parse({
      ...baseTrace,
      project_context: [
        { path: 'docs/a.md', section: 'project_context', source: 'agent', order: 0, tokens: 12, status: 'injected' },
        { path: 'docs/b.md', section: 'project_specifications', source: 'skill-x', order: 1, tokens: 0, status: 'skipped', reason: 'missing' },
      ],
    });
    expect(trace.project_context).toHaveLength(2);
    expect(() => ProjectContextRecord.parse({ ...trace.project_context[0], reason: 'nope' })).toThrow();
  });

  it('SetProjectContextBody rejects duplicate paths and more than 50 paths', () => {
    const repo_id = '00000000-0000-4000-8000-000000000001';
    expect(SetProjectContextBody.safeParse({ repo_id, paths: ['docs/a.md', 'docs/b.md'] }).success).toBe(true);
    expect(SetProjectContextBody.safeParse({ repo_id, paths: ['docs/a.md', 'docs/a.md'] }).success).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => `docs/${i}.md`);
    expect(SetProjectContextBody.safeParse({ repo_id, paths: many }).success).toBe(false);
    expect(SetProjectContextBody.safeParse({ repo_id, paths: many.slice(0, 50) }).success).toBe(true);
  });
});

describe('BriefModelOutput', () => {
  const risk = {
    file_refs: ['src/a.ts'],
    explanation: 'e',
    title: 't',
    kind: 'k',
    severity: 'high' as const,
    line: null as number | null,
  };
  const focus = { file: 'src/a.ts', line: 1, reason: 'r' };
  const valid = { summary: 'ok', risks: [risk], review_focus: [focus] };

  it('accepts a valid output and enforces the limits', () => {
    expect(BriefModelOutput.safeParse(valid).success).toBe(true);
    expect(BriefModelOutput.safeParse({ ...valid, risks: Array(7).fill(risk) }).success).toBe(false);
    expect(BriefModelOutput.safeParse({ ...valid, review_focus: Array(9).fill(focus) }).success).toBe(false);
    expect(BriefModelOutput.safeParse({ ...valid, summary: 'x'.repeat(601) }).success).toBe(false);
    expect(
      BriefModelOutput.safeParse({ ...valid, risks: [{ ...risk, file_refs: [] }] }).success,
    ).toBe(false);
  });

  it('accepts a null or numeric risk line, rejects a missing key and non-positive-integer lines', () => {
    expect(BriefModelOutput.safeParse({ ...valid, risks: [{ ...risk, line: null }] }).success).toBe(true);
    expect(BriefModelOutput.safeParse({ ...valid, risks: [{ ...risk, line: 12 }] }).success).toBe(true);
    const { line: _omit, ...noLine } = risk;
    expect(BriefModelOutput.safeParse({ ...valid, risks: [noLine] }).success).toBe(false);
    for (const bad of [0, 1.5, '3']) {
      expect(BriefModelOutput.safeParse({ ...valid, risks: [{ ...risk, line: bad }] }).success).toBe(false);
      expect(BriefRiskRecord.safeParse({ ...risk, line: bad }).success).toBe(false);
    }
  });

  it('accepts any kind string (instructions guide, the schema stays permissive)', () => {
    for (const kind of ['api-contract', 'Security']) {
      expect(BriefModelOutput.safeParse({ ...valid, risks: [{ ...risk, kind }] }).success).toBe(true);
    }
  });

  it('keeps the observe-before-judge key order with line right after file_refs', () => {
    const order = ['file_refs', 'line', 'explanation', 'title', 'kind', 'severity'];
    expect(Object.keys(BriefRiskOut.shape)).toEqual(order);
    expect(Object.keys(BriefRiskRecord.shape)).toEqual(order);
  });

  it('strict-mode guard: every property of every object is required and line is anyOf [integer, null]', () => {
    // Same converter the LLM adapters use (platform/structured -> reviewer-core toJsonSchema).
    const { schema } = toJsonSchema(BriefModelOutput, 'PrBrief');
    const objects: { properties?: Record<string, unknown>; required?: string[] }[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const n = node as Record<string, unknown>;
      if (n.properties) objects.push(n as never);
      Object.values(n).forEach(walk);
    };
    walk(schema);
    expect(objects.length).toBeGreaterThan(0);
    for (const o of objects) {
      expect([...(o.required ?? [])].sort()).toEqual(Object.keys(o.properties ?? {}).sort());
    }
    const riskObj = objects.find((o) => o.properties && 'file_refs' in o.properties)!;
    const line = riskObj.properties!.line as { anyOf?: { type?: string }[] };
    expect(line.anyOf?.map((x) => x.type).sort()).toEqual(['integer', 'null']);
  });
});

describe('PrBriefRecord risk line', () => {
  const base = {
    summary: 's',
    review_focus: [],
    head_sha: 'a',
    generated_at: 'now',
    provider: 'openai',
    model: 'm',
    usage: { tokens_in: 1, tokens_out: 1, cost_usd: null, attempts: 1, input_tokens_total: 1, input_tokens_by_source: {} },
    reductions: [],
    facts: {
      intent: 'present',
      blast: { status: 'present' },
      linked_issue: 'none',
      description: 'empty',
      specs: { status: 'none_attached', agent: null, included_paths: [], omitted_paths: [] },
    },
    grounding: { risks_dropped: 0, risk_refs_removed: 0, focus_dropped: 0, focus_lines_snapped: 0 },
  };
  const r1 = { file_refs: ['a.ts'], explanation: 'e', title: 't', kind: 'api-contract', severity: 'low' };

  it('parses a revision-1 record (no line, no counters), a null line and a numeric line', () => {
    expect(PrBriefRecord.safeParse({ ...base, risks: [r1] }).success).toBe(true);
    expect(PrBriefRecord.safeParse({ ...base, risks: [{ ...r1, line: null }] }).success).toBe(true);
    expect(PrBriefRecord.safeParse({ ...base, risks: [{ ...r1, line: 12 }] }).success).toBe(true);
    const withCounters = { ...base.grounding, risk_lines_snapped: 1, risk_lines_dropped: 2 };
    expect(PrBriefRecord.safeParse({ ...base, risks: [], grounding: withCounters }).success).toBe(true);
  });
});
