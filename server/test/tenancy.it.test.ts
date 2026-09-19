import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('workspace ownership guards (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let foreignRepoId: string;
  let foreignRunId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    app = await buildApp({ config: config(), db: pg.handle.db });

    const [workspace] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'foreign-workspace' })
      .returning();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: workspace!.id,
        owner: 'foreign',
        name: 'payments-api',
        fullName: 'foreign/payments-api',
      })
      .returning();
    foreignRepoId = repo!.id;

    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: workspace!.id,
        repoId: foreignRepoId,
        number: 1,
        title: 'Foreign pull request',
        author: 'foreign-user',
        branch: 'feature/foreign',
        base: 'main',
        headSha: 'foreign-sha',
      })
      .returning();
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId: workspace!.id,
        prId: pr!.id,
        status: 'running',
        provider: 'openai',
        model: 'gpt-4.1',
      })
      .returning();
    foreignRunId = run!.id;
    await pg.handle.db.insert(t.runTraces).values({ runId: foreignRunId, trace: {} });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('rejects foreign run access for cancel, trace, and events', async () => {
    expect((await app.inject({ method: 'POST', url: `/runs/${foreignRunId}/cancel` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/runs/${foreignRunId}/trace` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/runs/${foreignRunId}/events` })).statusCode).toBe(404);

    const [run] = await pg.handle.db
      .select({ status: t.agentRuns.status })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, foreignRunId));
    expect(run?.status).toBe('running');
  });

  it('rejects foreign repository access for index state and resync', async () => {
    expect((await app.inject({ method: 'GET', url: `/repos/${foreignRepoId}/index-state` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/repos/${foreignRepoId}/resync` })).statusCode).toBe(404);
  });
});
