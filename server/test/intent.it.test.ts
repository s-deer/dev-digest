import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) console.warn('[intent] Docker not available - skipping integration tests.');

/** PR #482's seeded head SHA (server/src/db/seed.ts). */
const HEAD_SHA = 'a1b2c3d4e5f6';
const PLAN_DOC = '# Plan\n\nAdd a token-bucket rate limiter to public endpoints.';

const STRUCTURED = {
  evidence: [{ source_ref: 'docs/plan.md', quote: 'Add a token-bucket rate limiter to public endpoints.' }],
  intent: 'Prevent abuse of public API endpoints from unauthenticated clients.',
  in_scope: ['Add a token-bucket rate limiter'],
  out_of_scope: [],
  change_type: 'feature',
  self_confidence: 'high',
};

d('intent routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
    prId = pr!.id;
    await pg.handle.db.delete(t.prIntent).where(eq(t.prIntent.prId, prId));
    // Seeded body has no issue/plan reference; give it one so the evidence
    // cap can reach `high` (both fetched, per `evidenceCap`).
    await pg.handle.db
      .update(t.pullRequests)
      .set({ body: 'Closes #501. See docs/plan.md for the design.' })
      .where(eq(t.pullRequests.id, prId));
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function appWithMocks(llm: MockLLMProvider) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ filesAt: { [`${HEAD_SHA}:docs/plan.md`]: PLAN_DOC } }),
        github: new MockGitHubClient({
          contents: { 'docs/plan.md': PLAN_DOC },
          issues: { 501: { number: 501, title: 'Rate limit abuse', body: 'Public endpoints get hammered.', state: 'open' } },
        }),
        llm: { openrouter: llm },
      },
    });
  }

  it('GET before the first generation returns {intent: null}', async () => {
    const server = await appWithMocks(new MockLLMProvider('openrouter'));
    const res = await server.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null });
    await server.close();
  });

  it('POST generates a numeric cost, and a repeat POST reuses the cache (no new LLM call)', async () => {
    const llm = new MockLLMProvider('openrouter', { structuredBySchema: { PrIntent: STRUCTURED } });
    const server = await appWithMocks(llm);

    const first = await server.inject({ method: 'POST', url: `/pulls/${prId}/intent`, payload: {} });
    expect(first.statusCode).toBe(200);
    const record = first.json();
    expect(record.confidence).toBe('high');
    expect(record.stale).toBe(false);
    expect(typeof record.cost_usd).toBe('number');
    expect(record.cost_usd_total).toBeCloseTo(record.cost_usd, 6);

    const second = await server.inject({ method: 'POST', url: `/pulls/${prId}/intent`, payload: {} });
    expect(second.statusCode).toBe(200);
    expect(second.json().cost_usd_total).toBeCloseTo(record.cost_usd_total, 6);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    await server.close();
  });

  it('force:true bypasses the cache and accumulates cost_usd_total onto the running total', async () => {
    const llm = new MockLLMProvider('openrouter', { structuredBySchema: { PrIntent: STRUCTURED } });
    const server = await appWithMocks(llm);

    const before = await server.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    const totalBefore = before.json().intent.cost_usd_total as number;

    const forced = await server.inject({ method: 'POST', url: `/pulls/${prId}/intent`, payload: { force: true } });
    expect(forced.statusCode).toBe(200);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const record = forced.json();
    expect(record.cost_usd_total).toBeCloseTo(totalBefore + record.cost_usd, 6);

    await server.close();
  });

  it('flips `stale` once the PR head moves, and 404s for a PR in a different workspace', async () => {
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'deadbeef00' }).where(eq(t.pullRequests.id, prId));
    const server = await appWithMocks(new MockLLMProvider('openrouter'));
    const staleRes = await server.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(staleRes.json().intent.stale).toBe(true);
    await pg.handle.db.update(t.pullRequests).set({ headSha: HEAD_SHA }).where(eq(t.pullRequests.id, prId));

    const [foreignWorkspace] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-intent-ws' }).returning();
    const [foreignRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: foreignWorkspace!.id, owner: 'foreign', name: 'other-api', fullName: 'foreign/other-api' })
      .returning();
    const [foreignPr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: foreignWorkspace!.id,
        repoId: foreignRepo!.id,
        number: 1,
        title: 'Foreign pull request',
        author: 'foreign-user',
        branch: 'feature/foreign',
        base: 'main',
        headSha: 'foreignsha0',
      })
      .returning();

    expect((await server.inject({ method: 'GET', url: `/pulls/${foreignPr!.id}/intent` })).statusCode).toBe(404);
    expect(
      (await server.inject({ method: 'POST', url: `/pulls/${foreignPr!.id}/intent`, payload: {} })).statusCode,
    ).toBe(404);

    await server.close();
  });

  it('GET /repos/:id/pulls folds the intent cost into the PR list cost_usd', async () => {
    // No GitHub override: the route falls back to serving persisted rows when
    // no token is configured, so this doesn't overwrite the PR's head_sha.
    const server = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
    });
    const res = await server.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(res.statusCode).toBe(200);
    const pr = (res.json() as { id: string; cost_usd: number | null }[]).find((row) => row.id === prId);
    expect(pr?.cost_usd).toBeGreaterThan(0);
    await server.close();
  });
});
