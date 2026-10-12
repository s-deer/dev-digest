import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) console.warn('[brief] Docker not available - skipping integration tests.');

/** PR #482's seeded head SHA (server/src/db/seed.ts). */
const HEAD_SHA = 'a1b2c3d4e5f6';
const MODEL = { provider: 'openrouter', model: 'test/brief-model' };

const OUTPUT = {
  summary: 'Adds a token-bucket rate limiter to public endpoints.',
  risks: [
    {
      file_refs: ['src/middleware/ratelimit.ts', 'src/invented.ts'],
      line: 200,
      explanation: 'Shared bucket state across requests.',
      title: 'Limiter state',
      kind: 'perf',
      severity: 'medium',
    },
    {
      file_refs: ['src/api/users.ts'],
      line: null,
      explanation: 'No single line.',
      title: 'Caller exposure',
      kind: 'other',
      severity: 'low',
    },
    {
      file_refs: ['src/config.ts'],
      line: 7,
      explanation: 'No hunks and no callers to snap to.',
      title: 'Config',
      kind: 'other',
      severity: 'low',
    },
  ],
  review_focus: [
    { file: 'src/middleware/ratelimit.ts', line: 40, reason: 'bucket refill' },
    { file: 'src/api/users.ts', line: 30, reason: 'caller of the limiter' },
    { file: 'src/ghost.ts', line: 1, reason: 'not in the PR' },
  ],
};

class FakeRepoIntel implements Pick<RepoIntel, 'getBlastRadius'> {
  async getBlastRadius(): Promise<BlastResult> {
    return {
      changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimiter', kind: 'function' }],
      callers: [{ file: 'src/api/users.ts', symbol: 'listUsers', viaSymbol: 'rateLimiter', line: 30, rank: 2 }],
      impactedEndpoints: ['GET /users'],
      factsByFile: { 'src/api/users.ts': { endpoints: ['GET /users'], crons: [] } },
      degraded: false,
    };
  }
}

d('brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    ({ workspaceId } = await seed(db));
    const [repo] = await db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    const [pr] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    prId = pr!.id;
    await db.delete(t.prBrief).where(eq(t.prBrief.prId, prId));
    await db
      .update(t.prFiles)
      .set({ patch: '@@ -0,0 +1,84 @@\n+line' })
      .where(and(eq(t.prFiles.prId, prId), eq(t.prFiles.path, 'src/middleware/ratelimit.ts')));
    // The workspace picks the model for the `risk_brief` feature.
    await db.insert(t.settings).values({ workspaceId, key: 'feature_models', value: { risk_brief: MODEL } });
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: MockLLMProvider) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel: new FakeRepoIntel() as unknown as RepoIntel,
        llm: { openrouter: llm },
      },
    });
  }
  const calls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');

  it('GET before any generation returns {brief:null, stale:false} with zero model calls', async () => {
    const llm = new MockLLMProvider('openrouter');
    const server = await appWith(llm);
    const res = await server.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false });
    expect(calls(llm)).toHaveLength(0);
    await server.close();
  });

  it('POST makes exactly one model call with the configured model, grounds and stores; GET reads it back without a call', async () => {
    const llm = new MockLLMProvider('openrouter', { structuredBySchema: { PrBrief: OUTPUT } });
    const server = await appWith(llm);
    const post = await server.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(post.statusCode).toBe(200);
    expect(calls(llm)).toHaveLength(1);
    expect((calls(llm)[0]!.req as { model: string }).model).toBe(MODEL.model);
    const { brief, stale } = post.json();
    expect(stale).toBe(false);
    expect(brief).toMatchObject({ provider: 'openrouter', model: MODEL.model, head_sha: HEAD_SHA });
    expect(brief.risks[0].file_refs).toEqual(['src/middleware/ratelimit.ts']);
    expect(brief.review_focus.map((f: { file: string; line: number }) => [f.file, f.line])).toEqual([
      ['src/middleware/ratelimit.ts', 40],
      ['src/api/users.ts', 30],
    ]);
    expect(brief.grounding).toMatchObject({
      risk_refs_removed: 1,
      focus_dropped: 1,
      risk_lines_snapped: 1,
      risk_lines_dropped: 1,
    });
    // 200 is outside the hunk 1..84 -> snapped to its start; null stays null; no-ranges/no-callers -> null
    expect(brief.risks.map((r: { line: number | null }) => r.line)).toEqual([1, null, null]);
    expect(brief.usage.input_tokens_total).toBeGreaterThan(0);
    expect(brief.usage.input_tokens_total).toBeLessThanOrEqual(8000);

    const get = await server.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(get.json()).toEqual({ brief, stale: false });
    expect(calls(llm)).toHaveLength(1);
    await server.close();
  });

  it('flips stale when the head moves; POST refreshes it; invalid output is a 502 that keeps the old brief', async () => {
    const db = pg.handle.db;
    await db.update(t.pullRequests).set({ headSha: 'deadbeef00' }).where(eq(t.pullRequests.id, prId));
    const okLlm = new MockLLMProvider('openrouter', { structuredBySchema: { PrBrief: OUTPUT } });
    const server = await appWith(okLlm);
    const stale = await server.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(stale.json().stale).toBe(true);
    expect(calls(okLlm)).toHaveLength(0);

    const badLlm = new MockLLMProvider('openrouter', { structuredBySchema: { PrBrief: { summary: '' } } });
    const bad = await appWith(badLlm);
    const failed = await bad.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(failed.statusCode).toBe(502);
    expect((await bad.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json().brief.head_sha).toBe(HEAD_SHA);
    await bad.close();

    const refreshed = await server.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json()).toMatchObject({ stale: false, brief: { head_sha: 'deadbeef00' } });
    expect((await server.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json().stale).toBe(false);
    await server.close();
    await db.update(t.pullRequests).set({ headSha: HEAD_SHA }).where(eq(t.pullRequests.id, prId));
  });

  it('a PR with no pr_files is a 422 with no model call; a cross-workspace PR is a 404', async () => {
    const db = pg.handle.db;
    const llm = new MockLLMProvider('openrouter', { structuredBySchema: { PrBrief: OUTPUT } });
    const server = await appWith(llm);

    const [foreignWs] = await db.insert(t.workspaces).values({ name: 'foreign-brief-it-ws' }).returning();
    const [foreignRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: foreignWs!.id, owner: 'foreign', name: 'other', fullName: 'foreign/other' })
      .returning();
    const [foreignPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: foreignWs!.id,
        repoId: foreignRepo!.id,
        number: 1,
        title: 'Foreign',
        author: 'x',
        branch: 'f',
        base: 'main',
        headSha: 'foreignsha0',
      })
      .returning();
    expect((await server.inject({ method: 'GET', url: `/pulls/${foreignPr!.id}/brief` })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: `/pulls/${foreignPr!.id}/brief` })).statusCode).toBe(404);

    // Same workspace, but no changed files.
    const [repo] = await db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    const [empty] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 9001,
        title: 'Empty PR',
        author: 'x',
        branch: 'e',
        base: 'main',
        headSha: 'emptysha00',
      })
      .returning();
    const res = await server.inject({ method: 'POST', url: `/pulls/${empty!.id}/brief` });
    expect(res.statusCode).toBe(422);
    expect(calls(llm)).toHaveLength(0);
    await server.close();
  });
  it('GET reads a revision-1 record (no risk line, no counters, free-form kind) and a null-line record unchanged', async () => {
    const db = pg.handle.db;
    const llm = new MockLLMProvider('openrouter');
    const server = await appWith(llm);
    const [current] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    const base = current!.json as Record<string, unknown>;
    const rev1 = {
      ...base,
      risks: [{ file_refs: ['src/config.ts'], explanation: 'e', title: 't', kind: 'api-contract', severity: 'low' }],
      grounding: { risks_dropped: 0, risk_refs_removed: 0, focus_dropped: 0, focus_lines_snapped: 0 },
    };
    const nullLine = {
      ...rev1,
      risks: [{ file_refs: ['src/config.ts'], line: null, explanation: 'e', title: 't', kind: 'other', severity: 'low' }],
    };
    for (const stored of [rev1, nullLine]) {
      await db.update(t.prBrief).set({ json: stored }).where(eq(t.prBrief.prId, prId));
      const res = await server.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
      expect(res.statusCode).toBe(200);
      expect(res.json().brief.risks).toEqual(stored.risks);
      expect(typeof res.json().stale).toBe('boolean');
      const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
      expect(row!.json).toEqual(stored);
    }
    expect(calls(llm)).toHaveLength(0);
    await server.close();
  });
});
