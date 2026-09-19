import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

d('skills routes and agent attachments', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function app() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const skillBody = '# Branches\nReview every false and empty branch.';

  it('previews Markdown without persisting it, then creates and versions a skill', async () => {
    const server = await app();
    const before = (await server.inject({ method: 'GET', url: '/skills' })).json().length;
    const preview = await server.inject({ method: 'POST', url: '/skills/import-preview', payload: { markdown: skillBody } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ name: 'Branches', body: skillBody });
    expect((await server.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const created = await server.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'Branches',
        description: 'Checks changed branches.',
        type: 'rubric',
        source: 'extracted',
        body: skillBody,
      },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'Branches', source: 'extracted', version: 1, enabled: true });

    const updated = await server.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: `${skillBody}\nCover limits too.` },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
    await server.close();
  });

  it('stores per-agent activation and rejects a skill from another workspace', async () => {
    const server = await app();
    const agent = await server.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Attachment test', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    const skills = (await server.inject({ method: 'GET', url: '/skills' })).json() as { id: string }[];
    const local = skills[0]!;
    const attached = await server.inject({
      method: 'POST',
      url: `/agents/${agent.json().id}/skills`,
      payload: { links: [{ skill_id: local.id, enabled: false, order: 0 }] },
    });
    expect(attached.statusCode).toBe(200);
    expect(attached.json()).toEqual([{ agent_id: agent.json().id, skill_id: local.id, enabled: false, order: 0 }]);

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'skills-other' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: other!.id,
        name: 'Foreign',
        description: 'Foreign skill.',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();
    const rejected = await server.inject({
      method: 'POST',
      url: `/agents/${agent.json().id}/skills`,
      payload: { links: [{ skill_id: foreign!.id, enabled: true, order: 0 }] },
    });
    expect(rejected.statusCode).toBe(422);

    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agent.json().id), eq(t.agentSkills.skillId, local.id)));
    expect(links).toHaveLength(1);
    expect(links[0]!.enabled).toBe(false);
    await server.close();
  });
});
