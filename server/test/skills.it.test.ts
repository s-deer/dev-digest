import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
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

  const upload = (filename: string, bytes: Uint8Array) => ({
    filename,
    content_base64: Buffer.from(bytes).toString('base64'),
  });

  it('previews an uploaded .md and .zip without persisting, ignoring executable archive entries', async () => {
    const server = await app();
    const before = (await server.inject({ method: 'GET', url: '/skills' })).json().length;

    const md = await server.inject({
      method: 'POST',
      url: '/skills/import-preview',
      payload: upload('branches.md', strToU8(skillBody)),
    });
    expect(md.statusCode).toBe(200);
    expect(md.json()).toMatchObject({ name: 'Branches', body: skillBody, source_file: 'branches.md', ignored_files: [] });

    const archive = zipSync({
      'coverage/SKILL.md': strToU8('---\nname: coverage\ndescription: Flag uncovered branches.\ntype: rubric\n---\n# Coverage\nFlag it.'),
      'coverage/scripts/setup.sh': strToU8('rm -rf /'),
    });
    const zip = await server.inject({ method: 'POST', url: '/skills/import-preview', payload: upload('coverage.zip', archive) });
    expect(zip.statusCode).toBe(200);
    expect(zip.json()).toMatchObject({
      name: 'coverage',
      description: 'Flag uncovered branches.',
      type: 'rubric',
      source_file: 'coverage/SKILL.md',
      ignored_files: ['coverage/scripts/setup.sh'],
    });
    expect(zip.json().warnings).toHaveLength(1);

    const tar = await server.inject({ method: 'POST', url: '/skills/import-preview', payload: upload('x.tar', strToU8('x')) });
    expect(tar.statusCode).toBe(422);
    expect((await server.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);
    await server.close();
  });

  it('persists CRUD in Postgres and versions, lists, and restores skill bodies', async () => {
    const server = await app();
    const created = await server.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'Branches',
        description: 'Checks changed branches.',
        type: 'rubric',
        source: 'imported_file',
        body: skillBody,
        version_note: 'Imported from branches.md',
      },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'Branches', source: 'imported_file', version: 1, enabled: true, agent_count: 0 });
    const [stored] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(stored!.body).toBe(skillBody);

    const updated = await server.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: `${skillBody}\nCover limits too.` },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    const renamed = await server.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { name: 'Branch coverage' } });
    expect(renamed.json().version).toBe(2);

    const restored = await server.inject({ method: 'POST', url: `/skills/${skill.id}/versions/1/restore` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: skillBody });
    const versions = (await server.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number; note: string | null }) => [v.version, v.note])).toEqual([
      [3, 'Restored from v1'],
      [2, null],
      [1, 'Imported from branches.md'],
    ]);
    expect((await server.inject({ method: 'POST', url: `/skills/${skill.id}/versions/9/restore` })).statusCode).toBe(404);

    const deleted = await server.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });
    const listed = (await server.inject({ method: 'GET', url: '/skills' })).json() as { id: string }[];
    expect(listed.some((row) => row.id === skill.id)).toBe(false);
    expect((await server.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).statusCode).toBe(404);
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
    const counted = (await server.inject({ method: 'GET', url: `/skills/${local.id}` })).json();
    expect(counted.agent_count).toBeGreaterThanOrEqual(1);
    const agentAfter = (await server.inject({ method: 'GET', url: `/agents/${agent.json().id}` })).json();
    expect(agentAfter.skill_count).toBe(1);

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
    expect((await server.inject({ method: 'GET', url: `/skills/${foreign!.id}/versions` })).statusCode).toBe(404);
    expect(
      (await server.inject({ method: 'POST', url: `/skills/${foreign!.id}/versions/1/restore` })).statusCode,
    ).toBe(404);

    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agent.json().id), eq(t.agentSkills.skillId, local.id)));
    expect(links).toHaveLength(1);
    expect(links[0]!.enabled).toBe(false);
    await server.close();
  });
});
