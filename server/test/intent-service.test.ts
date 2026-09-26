import { describe, it, expect } from 'vitest';
import type { IntentSource } from '@devdigest/shared';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { IntentService, type IntentStorePort } from '../src/modules/intent/service.js';
import type { IntentInputs, StoredIntent, UpsertIntentInput } from '../src/modules/intent/domain.js';

/**
 * Hermetic IntentService tests (no DB): an in-memory `IntentStorePort` fake
 * stands in for `IntentRepository`, mocked git/github/llm ports stand in for
 * network. Covers the plan's 5 scenarios (docs/plans/intent-layer-plan.md,
 * Phase 3 §Тести).
 */

// `IntentInputs.pull` is the domain `IntentPull` shape (id, number, title,
// body, branch, headSha) — never a Drizzle `PullRow`; the workspace scoping
// this fake needs lives outside it (`ws-1`, closed over below).
function makePull(overrides: Partial<IntentInputs['pull']> = {}): IntentInputs['pull'] {
  return {
    id: 'pr-1',
    number: 482,
    title: 'Add rate limiting',
    branch: 'feat/rate-limit',
    headSha: 'abc1234',
    body: null,
    ...overrides,
  };
}

class FakeIntentStore implements IntentStorePort {
  rows = new Map<string, StoredIntent>();
  updatePullBodyCalls = 0;

  constructor(
    private inputs: IntentInputs,
    private workspaceId = 'ws-1',
  ) {}

  async loadInputs(workspaceId: string, prId: string): Promise<IntentInputs | undefined> {
    if (workspaceId !== this.workspaceId || prId !== this.inputs.pull.id) return undefined;
    return this.inputs;
  }

  async get(_workspaceId: string, prId: string): Promise<StoredIntent | undefined> {
    return this.rows.get(prId);
  }

  async upsert(values: UpsertIntentInput): Promise<StoredIntent> {
    const prev = this.rows.get(values.prId);
    const row: StoredIntent = {
      intent: values.intent,
      in_scope: values.inScope,
      out_of_scope: values.outOfScope,
      head_sha: values.headSha,
      inputs_hash: values.inputsHash,
      change_type: values.changeType,
      confidence: values.confidence,
      confidence_score: values.confidenceScore,
      missing_docs: values.missingDocs,
      sources: values.sources,
      pr_id: values.prId,
      provider: values.provider,
      model: values.model,
      tokens_in: values.tokensIn,
      tokens_out: values.tokensOut,
      cost_usd: values.costUsd,
      cost_usd_total: (prev?.cost_usd_total ?? 0) + (values.costUsd ?? 0),
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    this.rows.set(values.prId, row);
    return row;
  }

  async updatePullBody(_workspaceId: string, _prId: string, body: string): Promise<void> {
    this.updatePullBodyCalls += 1;
    this.inputs.pull.body = body;
  }
}

function findSource(sources: IntentSource[], kind: IntentSource['kind'], ref: string) {
  return sources.find((s) => s.kind === kind && s.ref === ref);
}

describe('IntentService.ensure', () => {
  it('1) linked issue + plan doc → both fetched, high confidence, plan text reaches the LLM message', async () => {
    const inputs: IntentInputs = {
      pull: makePull({ body: 'Closes #471, see docs/plan.md', title: 'Add rate limiting' }),
      repo: { owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api' },
      commits: ['feat: add limiter'],
      filePaths: ['src/limiter.ts'],
    };
    const store = new FakeIntentStore(inputs);
    const git = new MockGitClient({ filesAt: { 'abc1234:docs/plan.md': '# The Plan\n\nDo the rate-limit thing.' } });
    const github = new MockGitHubClient({ issues: { 471: { number: 471, title: 'Bug', body: 'Detailed issue body', state: 'open' } } });
    const llm = new MockLLMProvider('openrouter', {
      structuredBySchema: {
        PrIntent: {
          evidence: [{ source_ref: 'docs/plan.md', quote: 'Do the rate-limit thing.' }],
          intent: 'Prevent API abuse from unauthenticated clients.',
          in_scope: ['Add rate limiting middleware'],
          out_of_scope: [],
          change_type: 'feature',
          self_confidence: 'high',
        },
      },
    });
    const service = new IntentService({
      intents: store,
      github: async () => github,
      git,
      resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
      llm: async () => llm,
    });

    const { record, cached } = await service.ensure('ws-1', 'pr-1');
    expect(cached).toBe(false);
    expect(record.confidence).toBe('high');
    expect(record.confidence_score).toBeCloseTo(0.85);
    expect(findSource(record.sources, 'issue', '#471')?.fetched).toBe(true);
    expect(findSource(record.sources, 'plan', 'docs/plan.md')?.fetched).toBe(true);

    const lastCall = llm.calls.filter((c) => c.method === 'completeStructured').at(-1) as {
      req: { messages: { content: string }[] };
    };
    expect(lastCall.req.messages[1]!.content).toContain('Do the rate-limit thing.');
  });

  it('2) empty body + conventional commit → low despite the LLM saying high, missing_docs, zero fetches, feature', async () => {
    const inputs: IntentInputs = {
      pull: makePull({ body: '', title: 'wip', branch: 'feat/x' }),
      repo: { owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api' },
      commits: ['feat: add y'],
      filePaths: [],
    };
    const store = new FakeIntentStore(inputs);
    const git = new MockGitClient();
    const github = new MockGitHubClient();
    const llm = new MockLLMProvider('openrouter', {
      structured: {
        evidence: [],
        intent: 'Adds y.',
        in_scope: [],
        out_of_scope: [],
        change_type: 'other',
        self_confidence: 'high',
      },
    });
    const service = new IntentService({
      intents: store,
      github: async () => github,
      git,
      resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
      llm: async () => llm,
    });

    const { record } = await service.ensure('ws-1', 'pr-1');
    expect(record.confidence).toBe('low');
    expect(record.missing_docs).toBe(true);
    expect(record.change_type).toBe('feature');
    expect(github.issueCalls).toHaveLength(0);
    expect(github.contentCalls).toHaveLength(0);
  });

  it('3) a repeat ensure hits the cache (0 new LLM calls); force:true bypasses it (+1)', async () => {
    const inputs: IntentInputs = {
      pull: makePull({ body: 'Closes #471, see docs/plan.md' }),
      repo: { owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api' },
      commits: ['feat: add limiter'],
      filePaths: ['src/limiter.ts'],
    };
    const store = new FakeIntentStore(inputs);
    const git = new MockGitClient({ filesAt: { 'abc1234:docs/plan.md': '# Plan' } });
    const github = new MockGitHubClient({ issues: { 471: { number: 471, title: 'Bug', body: 'x', state: 'open' } } });
    const llm = new MockLLMProvider('openrouter', {
      structured: {
        evidence: [],
        intent: 'x',
        in_scope: [],
        out_of_scope: [],
        change_type: 'feature',
        self_confidence: 'high',
      },
    });
    const service = new IntentService({
      intents: store,
      github: async () => github,
      git,
      resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
      llm: async () => llm,
    });

    await service.ensure('ws-1', 'pr-1');
    const callsAfterFirst = llm.calls.filter((c) => c.method === 'completeStructured').length;
    expect(callsAfterFirst).toBe(1);

    const second = await service.ensure('ws-1', 'pr-1');
    expect(second.cached).toBe(true);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const forced = await service.ensure('ws-1', 'pr-1', { force: true });
    expect(forced.cached).toBe(false);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);
  });

  it('4) a path-traversal doc and an arbitrary URL are never read; the URL is recorded as an unfetched external ref', async () => {
    const inputs: IntentInputs = {
      pull: makePull({
        body: 'See docs/../../secrets.md and https://evil.example/x for background.',
      }),
      repo: { owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api' },
      commits: [],
      filePaths: [],
    };
    const store = new FakeIntentStore(inputs);
    const git = new MockGitClient();
    const github = new MockGitHubClient();
    const llm = new MockLLMProvider('openrouter', {
      structured: {
        evidence: [],
        intent: 'x',
        in_scope: [],
        out_of_scope: [],
        change_type: 'other',
        self_confidence: 'low',
      },
    });
    const service = new IntentService({
      intents: store,
      github: async () => github,
      git,
      resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
      llm: async () => llm,
    });

    const { record } = await service.ensure('ws-1', 'pr-1');
    expect(github.contentCalls).toHaveLength(0);
    expect(record.sources.some((s) => s.ref.includes('secrets.md'))).toBe(false);
    expect(findSource(record.sources, 'external_ref', 'https://evil.example/x')).toMatchObject({ fetched: false });
  });

  it('5) a null PR body is fetched from GitHub and persisted', async () => {
    const inputs: IntentInputs = {
      pull: makePull({ body: null }),
      repo: { owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api' },
      commits: [],
      filePaths: [],
    };
    const store = new FakeIntentStore(inputs);
    const git = new MockGitClient();
    const github = new MockGitHubClient({ detail: { body: 'Fetched body text.' } });
    const llm = new MockLLMProvider('openrouter', {
      structured: {
        evidence: [],
        intent: 'x',
        in_scope: [],
        out_of_scope: [],
        change_type: 'other',
        self_confidence: 'low',
      },
    });
    const service = new IntentService({
      intents: store,
      github: async () => github,
      git,
      resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
      llm: async () => llm,
    });

    const { prBody } = await service.ensure('ws-1', 'pr-1');
    expect(prBody).toBe('Fetched body text.');
    expect(store.updatePullBodyCalls).toBe(1);
    expect(inputs.pull.body).toBe('Fetched body text.');
  });
});
