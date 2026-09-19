import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ConventionsRepository } from '../src/modules/conventions/repository.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) console.warn('[conventions] Docker not available - skipping integration tests.');

d('conventions routes', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let agentId: string;

  const source = [
    'export const PORT = 3000;',
    'export const HOST = "localhost";',
    'export function startServer() { return { port: PORT, host: HOST }; }',
  ].join('\n');

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
    await pg.handle.db.update(t.repos).set({ clonePath: '/mock/clones/acme/payments-api' }).where(eq(t.repos.id, repoId));
    await pg.handle.db.delete(t.conventions).where(eq(t.conventions.repoId, repoId));
    await pg.handle.db.delete(t.conventionScans).where(eq(t.conventionScans.repoId, repoId));
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
    agentId = agent!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function repoIntel(paths: string[]) {
    return {
      getConventionSamples: async () => paths,
    } as never;
  }

  async function app(llm: MockLLMProvider, paths = ['src/server.ts']) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'src/server.ts': source } }),
        llm: { openai: llm },
        repoIntel: repoIntel(paths),
      },
    });
  }

  it('extracts, verifies, persists across app rebuilds, and records counters', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              rule: 'Use named constants for server configuration.',
              rationale: 'Configuration is explicit at the boundary.',
              evidence_path: 'src/server.ts',
              evidence_line: 1,
              evidence_snippet: 'export const PORT = 3000;',
              occurrences: 2,
              category: 'structure',
              confidence: 0.91,
            },
            {
              rule: 'Invented evidence must be dropped.',
              rationale: 'This text is not in the repository.',
              evidence_path: 'src/server.ts',
              evidence_line: 2,
              evidence_snippet: 'not present in source',
              occurrences: 1,
              category: 'general',
              confidence: 0.99,
            },
          ],
        },
      },
    });
    const server = await app(llm);
    const extracted = await server.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(extracted.statusCode).toBe(200);
    expect(extracted.json()).toMatchObject({
      scan: { status: 'done', proposed: 2, kept: 1, dropped_ungrounded: 1 },
      state: { candidates: [{ status: 'pending', evidence_line: 1 }], counts: { pending: 1 } },
    });
    expect(llm.calls.filter((call) => call.method === 'completeStructured')).toHaveLength(1);
    await server.close();

    const rebuilt = await app(new MockLLMProvider());
    const listed = await rebuilt.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().candidates).toHaveLength(1);
    await rebuilt.close();
  });

  it('does not call the model when the repository has no indexed source sample', async () => {
    const llm = new MockLLMProvider('openai');
    const server = await app(llm, []);
    const response = await server.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(response.statusCode).toBe(422);
    expect(llm.calls.filter((call) => call.method === 'completeStructured')).toHaveLength(0);
    await server.close();
  });

  it('allows only one concurrent running scan per repository', async () => {
    const repository = new ConventionsRepository(pg.handle.db);
    const values = {
      workspaceId,
      repoId,
      provider: 'openai' as const,
      model: 'gpt-4.1',
      sampledFiles: [],
    };

    const scans = await Promise.all([repository.insertScan(values), repository.insertScan(values)]);
    const inserted = scans.filter((scan): scan is NonNullable<typeof scan> => scan !== undefined);

    expect(inserted).toHaveLength(1);
    expect(await repository.runningScan(workspaceId, repoId)).toMatchObject({ id: inserted[0]!.id });

    await repository.finishScan(inserted[0]!.id, { status: 'failed' });
  });

  it('rejects candidates, excludes them from the default list and draft, then versions the skill on repeat create', async () => {
    const [candidate] = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    const server = await app(new MockLLMProvider());
    const rejected = await server.inject({
      method: 'PATCH',
      url: `/conventions/${candidate!.id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(200);
    expect((await server.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json().candidates).toHaveLength(0);
    expect((await server.inject({ method: 'GET', url: `/repos/${repoId}/conventions?status=rejected` })).json().candidates).toHaveLength(1);
    expect((await server.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill-draft`, payload: { convention_ids: [candidate!.id] } })).statusCode).toBe(422);

    const accepted = await server.inject({
      method: 'PATCH',
      url: `/conventions/${candidate!.id}`,
      payload: { status: 'accepted' },
    });
    expect(accepted.statusCode).toBe(200);
    const draft = await server.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-draft`,
      payload: { convention_ids: [candidate!.id] },
    });
    expect(draft.statusCode).toBe(200);
    const body = draft.json();
    const created = await server.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { ...body, agent_id: agentId },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'repo-conventions', source: 'extracted', version: 1, agent_count: 1 });

    const again = await server.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { ...body, body: `${body.body}\n\nUpdated.`, agent_id: agentId },
    });
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ id: created.json().id, version: 2, agent_count: 1 });
    const links = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    expect(links).toHaveLength(1);
    expect(links[0]!.enabled).toBe(true);
    await server.close();
  });
});
