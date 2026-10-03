import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A unified diff matching `setupRepoAndPr`'s persisted patch (see reviews.it.test.ts). */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A single, grounded finding — no hallucination case needed here (that's reviews.it.test.ts's job). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `runs-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('runs API — POST /runs + GET /runs/:id (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // Same mocking rule as reviews.it.test.ts (server/INSIGHTS.md): every test
  // that reaches `/pulls/:id/review`'s shared pre-work must mock `github` and
  // `llm.openrouter`, or it silently falls through to real dev secrets.
  function appWith(structured: unknown) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          openai: new MockLLMProvider('openai', { structured }),
          openrouter: new MockLLMProvider('openrouter'),
        },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Runner', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    return res.json();
  }

  it('starts a run (201), runs it to done, and cost_usd is never a string', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);

    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { repo_id: repo.id, pr_number: pr.number, agent_id: agent.id },
    });
    expect(started.statusCode).toBe(201);
    const startBody = started.json();
    expect(startBody.reused).toBe(false);
    expect(startBody.pr_id).toBe(pr.id);
    expect(startBody.agent_id).toBe(agent.id);
    expect(startBody.agent_name).toBe(agent.name);

    // POST /runs is fire-and-forget, same as POST /pulls/:id/review.
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const detail = await app.inject({ method: 'GET', url: `/runs/${startBody.run_id}` });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.status).toBe('done');
    expect(body.verdict).toBe('request_changes');
    expect(body.findings).toHaveLength(1);
    expect(body.repo_full_name).toBe(repo.fullName);
    expect(body.pr_number).toBe(pr.number);
    expect(typeof body.cost_usd === 'number' || body.cost_usd === null).toBe(true);

    await app.close();
  });

  it('dedupes: a running run for the same agent + PR is reused (200, reused:true)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);

    // Insert the `running` row directly, bypassing the executor, so it never
    // completes during this test — findRunningRun checks this DB row, not
    // the (in-memory, per-process) RunBus.
    const [existing] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        prId: pr.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'running',
      })
      .returning();

    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { repo_id: repo.id, pr_number: pr.number, agent_id: agent.id },
    });
    expect(started.statusCode).toBe(200);
    const body = started.json();
    expect(body.reused).toBe(true);
    expect(body.run_id).toBe(existing!.id);

    await app.close();
  });

  it('a missing PR returns 404', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { repo_id: repo.id, pr_number: 9999, agent_id: agent.id },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('bad input (non-numeric pr_number) returns 422', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { repo_id: 'repo-1', pr_number: 'not-a-number', agent_id: 'agent-1' },
    });
    expect(res.statusCode).toBe(422);

    await app.close();
  });

  it('an unknown run returns 404', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const res = await app.inject({ method: 'GET', url: '/runs/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('a run from another workspace returns 404 (tenancy)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-ws-${repoSeq++}` }).returning();
    const { pr: otherPr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);
    const [otherRun] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId: otherWs!.id,
        agentId: null,
        prId: otherPr.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'done',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/runs/${otherRun!.id}` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
