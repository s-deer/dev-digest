import { describe, expect, it } from 'vitest';
import type { BlastRadiusResponse, PrBriefRecord, PrIntentRecord } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../src/platform/errors.js';
import type { BriefLogLine, BriefPullData } from '../src/modules/brief/domain.js';
import {
  BriefService,
  type BriefServiceDeps,
  type BriefSpecsResolved,
  type BriefStorePort,
} from '../src/modules/brief/service.js';

/**
 * Hermetic BriefService tests: in-memory store + fake ports + MockLLMProvider.
 */

const PATCH = '@@ -1,2 +10,4 @@\n a\n+b\n+c\n d';

function makePull(over: Partial<BriefPullData> = {}): BriefPullData {
  return {
    pull: { id: 'pr-1', number: 7, title: 'Add limiter', body: 'Adds a limiter.', headSha: 'sha-1' },
    repo: { id: 'repo-1', owner: 'acme', name: 'api' },
    files: [{ path: 'src/limiter.ts', additions: 3, deletions: 0, patch: PATCH }],
    ...over,
  };
}

class FakeStore implements BriefStorePort {
  stored: PrBriefRecord | undefined;
  saves = 0;
  agent: { id: string; name: string } | undefined = { id: 'ag-1', name: 'Reviewer' };
  constructor(public data: BriefPullData | undefined = makePull()) {}
  async loadPull(ws: string, id: string) {
    return ws === 'ws-1' && this.data && this.data.pull.id === id ? this.data : undefined;
  }
  async getStored() {
    return this.stored;
  }
  async save(_ws: string, _id: string, record: PrBriefRecord) {
    this.saves += 1;
    this.stored = record;
  }
  async latestRunAgent() {
    return this.agent;
  }
  async enabledSkills() {
    return [{ skillId: 'sk-1', name: 'Security' }];
  }
}

const OUTPUT = {
  summary: 'Adds a rate limiter to protect public endpoints.',
  risks: [
    { file_refs: ['src/limiter.ts', 'src/invented.ts'], line: 500, explanation: 'Shared state', title: 'Limiter state', kind: 'concurrency', severity: 'medium' },
    { file_refs: ['src/invented.ts'], line: null, explanation: 'x', title: 'Invented', kind: 'k', severity: 'low' },
  ],
  review_focus: [
    { file: 'src/limiter.ts', line: 500, reason: 'out of range line' },
    { file: 'src/nope.ts', line: 1, reason: 'invented' },
  ],
};

const intent = (stale = false) => ({ intent: 'Stop abuse', in_scope: [], out_of_scope: [], change_type: 'feature', confidence: 'high', stale }) as unknown as PrIntentRecord;
const blastRes = (over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse => ({
  changed_symbols: [{ name: 'limit', file: 'src/limiter.ts', kind: 'function' }],
  downstream: [{ symbol: 'limit', callers: [{ name: 'h', file: 'src/api.ts', line: 9 }], endpoints_affected: [], crons_affected: [] }],
  summary: 's',
  degraded: false,
  reason: null,
  ...over,
});

interface Harness {
  svc: BriefService;
  store: FakeStore;
  llm: MockLLMProvider;
  lines: BriefLogLine[];
  deps: BriefServiceDeps;
  completeCalls(): number;
}

function harness(over: Partial<BriefServiceDeps> = {}, llmOpts: ConstructorParameters<typeof MockLLMProvider>[1] = { structuredBySchema: { PrBrief: OUTPUT } }, store = new FakeStore()): Harness {
  const llm = new MockLLMProvider('openai', llmOpts);
  const deps: BriefServiceDeps = {
    store,
    intents: { get: async () => intent() },
    blast: { build: async () => blastRes() },
    specs: {
      resolveForRun: async (): Promise<BriefSpecsResolved> => ({
        contextDocs: [],
        specsDocs: [{ path: 'docs/spec.md', content: 'spec text' }],
        records: [{ path: 'docs/spec.md', status: 'injected' }],
      }),
    },
    github: async () => ({
      getPullRequest: async () => ({ linked_issue: { number: 3, title: 'Issue', body: null, state: 'open' }, body: null }) as never,
    }),
    tokenizer: { count: (t) => Math.ceil(t.length / 4) },
    resolveModel: async () => ({ provider: 'openai', model: 'gpt-test' }),
    llm: async () => llm,
    ...over,
  };
  const lines: BriefLogLine[] = [];
  const svc = new BriefService(deps);
  return {
    svc,
    store,
    llm,
    lines,
    deps,
    completeCalls: () => llm.calls.filter((c) => c.method === 'completeStructured').length,
  };
}

const run = (h: Harness) => h.svc.generate('ws-1', 'pr-1', { onFinish: (l) => h.lines.push(l) });

describe('BriefService', () => {
  it('makes exactly one model call per generate, none on get, grounds the output and stores the read-time head SHA', async () => {
    const h = harness();
    expect(await h.svc.get('ws-1', 'pr-1')).toEqual({ brief: null, stale: false });
    expect(h.completeCalls()).toBe(0);

    const res = await run(h);
    expect(h.completeCalls()).toBe(1);
    expect(res.stale).toBe(false);
    const brief = res.brief!;
    expect(brief.model).toBe('gpt-test');
    expect(brief.provider).toBe('openai');
    expect(brief.head_sha).toBe('sha-1');
    expect(brief.risks).toHaveLength(1);
    expect(brief.risks[0]!.file_refs).toEqual(['src/limiter.ts']);
    // 500 is outside the hunk 10..13 -> snapped to its start
    expect(brief.review_focus).toEqual([{ file: 'src/limiter.ts', line: 10, reason: 'out of range line' }]);
    expect(brief.grounding).toEqual({ risks_dropped: 1, risk_refs_removed: 2, focus_dropped: 1, focus_lines_snapped: 1, risk_lines_snapped: 1, risk_lines_dropped: 0 });
    // risk line 500 (first ref survived) snaps to the hunk start; the dropped risk's line is not counted
    expect(brief.risks[0]!.line).toBe(10);
    // the structured log line carries counters only, never text
    expect(h.lines[0]!.grounding).toEqual(brief.grounding);
    expect(JSON.stringify(h.lines[0])).not.toContain('Adds a rate limiter');
    expect(JSON.stringify(h.lines[0])).not.toContain('Shared state');
    expect(brief.usage).toMatchObject({ tokens_in: 100, tokens_out: 50, cost_usd: 0.001, attempts: 1 });
    expect(brief.usage.input_tokens_total).toBeGreaterThan(0);
    expect(brief.facts).toMatchObject({
      intent: 'present',
      blast: { status: 'present' },
      linked_issue: 'present',
      description: 'present',
      specs: { status: 'included', agent: { id: 'ag-1', name: 'Reviewer' }, included_paths: ['docs/spec.md'] },
    });

    const again = await h.svc.get('ws-1', 'pr-1');
    expect(again.brief).toEqual(brief);
    expect(h.completeCalls()).toBe(1);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).toMatchObject({ outcome: 'ok', model: 'gpt-test', attempts: 1, tokens_in: 100 });
  });

  it('sends the model request with the brief schema name, bounded input and no diff body', async () => {
    const h = harness();
    await run(h);
    const req = h.llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      schemaName: string;
      model: string;
      maxTokens: number;
      messages: { content: string }[];
    };
    expect(req.schemaName).toBe('PrBrief');
    expect(req.model).toBe('gpt-test');
    expect(req.maxTokens).toBe(1500);
    const text = req.messages.map((m) => m.content).join('\n');
    expect(text).toContain('src/limiter.ts');
    expect(text).not.toContain('+b');
  });

  it('flips stale when the head SHA moves', async () => {
    const h = harness();
    await run(h);
    h.store.data!.pull.headSha = 'sha-2';
    expect((await h.svc.get('ws-1', 'pr-1')).stale).toBe(true);
  });

  it('invalid model output leaves the stored brief unchanged, wraps as 502 and still logs once', async () => {
    const h = harness();
    await run(h);
    const before = h.store.stored;
    const failing = harness(
      {},
      { structuredBySchema: { PrBrief: { summary: '' } } },
      h.store,
    );
    await expect(run(failing)).rejects.toBeInstanceOf(ExternalServiceError);
    expect(h.store.stored).toBe(before);
    expect(h.store.saves).toBe(1);
    expect(failing.lines).toHaveLength(1);
    expect(failing.lines[0]!.outcome).toBe('external_service_error');
  });

  it('a budget failure makes zero model calls and returns brief_budget_exceeded (422)', async () => {
    const h = harness({ tokenizer: { count: () => 100_000 } });
    const err = await run(h).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('brief_budget_exceeded');
    expect(err.statusCode).toBe(422);
    expect(h.completeCalls()).toBe(0);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]!.outcome).toBe('brief_budget_exceeded');
  });

  it('no changed files -> ValidationError and zero model calls; unknown PR -> NotFoundError', async () => {
    const h = harness({}, undefined, new FakeStore(makePull({ files: [] })));
    await expect(run(h)).rejects.toBeInstanceOf(ValidationError);
    expect(h.completeCalls()).toBe(0);
    await expect(h.svc.generate('ws-1', 'other')).rejects.toBeInstanceOf(NotFoundError);
    await expect(h.svc.get('ws-2', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('degrades the facts but still generates: missing intent, degraded blast, no issue, no agent', async () => {
    const store = new FakeStore();
    store.agent = undefined;
    const h = harness(
      {
        intents: { get: async () => null },
        blast: { build: async () => blastRes({ degraded: true, reason: 'no_data' }) },
        github: async () => {
          throw new Error('offline');
        },
      },
      undefined,
      store,
    );
    const { brief } = await run(h);
    expect(brief!.facts).toMatchObject({
      intent: 'missing',
      blast: { status: 'degraded', reason: 'no_data' },
      linked_issue: 'none',
      specs: { status: 'no_agent', agent: null, included_paths: [] },
    });
    expect(h.completeCalls()).toBe(1);
  });

  it('stale intent, unavailable blast, none-attached and unavailable-clone specs each map to facts', async () => {
    const stale = harness({
      intents: { get: async () => intent(true) },
      blast: {
        build: async () => {
          throw new Error('boom');
        },
      },
      specs: { resolveForRun: async () => ({ contextDocs: [], specsDocs: [], records: [] }) },
    });
    const a = (await run(stale)).brief!;
    expect(a.facts).toMatchObject({ intent: 'stale', blast: { status: 'unavailable' }, specs: { status: 'none_attached' } });

    const clone = harness({
      specs: {
        resolveForRun: async () => ({
          contextDocs: [],
          specsDocs: [],
          records: [{ path: 'docs/spec.md', status: 'skipped', reason: 'repo_unavailable' }],
        }),
      },
    });
    const b = (await run(clone)).brief!;
    expect(b.facts.specs).toMatchObject({ status: 'unavailable', omitted_paths: ['docs/spec.md'] });
  });

  it('duration_ms_non_model excludes the model call time (fake clock)', async () => {
    let t = 0;
    const clock = () => t;
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrBrief: OUTPUT } });
    const slow = {
      ...llm,
      calls: llm.calls,
      id: llm.id,
      completeStructured: async (req: never) => {
        t += 5000; // the model call takes 5s
        return llm.completeStructured(req);
      },
    } as unknown as MockLLMProvider;
    const h = harness({
      now: clock,
      llm: async () => slow,
      store: new FakeStore(),
      blast: {
        build: async () => {
          t += 120; // non-model work
          return blastRes();
        },
      },
    });
    await run(h);
    expect(h.lines[0]!.duration_ms_non_model).toBe(120);
  });
});
