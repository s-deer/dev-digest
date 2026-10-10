import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ProjectContextRepository } from '../src/modules/project-context/repository.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) console.warn('[project-context] Docker not available - skipping integration tests.');

d('project-context (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let otherRepoId: string;
  let foreignWorkspaceId: string;
  let foreignRepoId: string;
  let repo: ProjectContextRepository;

  async function newAgent(name: string, ws = workspaceId, enabled = true) {
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws, name, provider: 'openrouter', model: 'm', systemPrompt: 'p', enabled })
      .returning();
    return row!;
  }
  async function newSkill(name: string, ws = workspaceId, enabled = true) {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: ws, name, description: 'd', type: 'custom', source: 'manual', body: 'b', enabled })
      .returning();
    return row!;
  }

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const db = pg.handle.db;
    const [r1] = await db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = r1!.id;
    const [r2] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'second', fullName: 'acme/second' })
      .returning();
    otherRepoId = r2!.id;
    const [ws] = await db.insert(t.workspaces).values({ name: 'foreign' }).returning();
    foreignWorkspaceId = ws!.id;
    const [fr] = await db
      .insert(t.repos)
      .values({ workspaceId: foreignWorkspaceId, owner: 'f', name: 'r', fullName: 'f/r' })
      .returning();
    foreignRepoId = fr!.id;
    repo = new ProjectContextRepository(db);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  describe('repository', () => {
    it('saves, reorders and replaces an agent set, isolated per repository', async () => {
      const agent = await newAgent('A-order');
      const owner = { kind: 'agent' as const, id: agent.id };
      await repo.replaceAttachments(workspaceId, owner, repoId, ['docs/b.md', 'docs/a.md', 'docs/c.md']);
      expect(await repo.listAttachments(workspaceId, owner, repoId)).toEqual(['docs/b.md', 'docs/a.md', 'docs/c.md']);

      await repo.replaceAttachments(workspaceId, owner, repoId, ['docs/c.md', 'docs/b.md']);
      expect(await repo.listAttachments(workspaceId, owner, repoId)).toEqual(['docs/c.md', 'docs/b.md']);

      // EC-23: the same agent in another repository has its own set
      expect(await repo.listAttachments(workspaceId, owner, otherRepoId)).toEqual([]);
      await repo.replaceAttachments(workspaceId, owner, otherRepoId, ['docs/z.md']);
      expect(await repo.listAttachments(workspaceId, owner, repoId)).toEqual(['docs/c.md', 'docs/b.md']);

      await repo.replaceAttachments(workspaceId, owner, repoId, []);
      expect(await repo.listAttachments(workspaceId, owner, repoId)).toEqual([]);
      expect(await repo.listAttachments(workspaceId, owner, otherRepoId)).toEqual(['docs/z.md']);
    });

    it('a failed replace (duplicate path) rolls back and leaves the previous set', async () => {
      const agent = await newAgent('A-tx');
      const owner = { kind: 'agent' as const, id: agent.id };
      await repo.replaceAttachments(workspaceId, owner, repoId, ['docs/a.md']);
      await expect(
        repo.replaceAttachments(workspaceId, owner, repoId, ['docs/x.md', 'docs/x.md']),
      ).rejects.toThrow();
      expect(await repo.listAttachments(workspaceId, owner, repoId)).toEqual(['docs/a.md']);
    });

    it('scopes every lookup by workspace (cross-workspace -> undefined / empty)', async () => {
      const agent = await newAgent('A-scope');
      const skill = await newSkill('S-scope');
      expect(await repo.agentInWorkspace(workspaceId, agent.id)).toMatchObject({ id: agent.id, name: 'A-scope' });
      expect(await repo.agentInWorkspace(foreignWorkspaceId, agent.id)).toBeUndefined();
      expect(await repo.skillInWorkspace(foreignWorkspaceId, skill.id)).toBeUndefined();
      expect(await repo.repoInWorkspace(workspaceId, foreignRepoId)).toBeUndefined();
      expect(await repo.repoInWorkspace(foreignWorkspaceId, repoId)).toBeUndefined();
      expect(await repo.repoInWorkspace(workspaceId, repoId)).toMatchObject({ id: repoId, fullName: 'acme/payments-api' });

      await repo.replaceAttachments(workspaceId, { kind: 'agent', id: agent.id }, repoId, ['docs/a.md']);
      expect(await repo.listAttachments(foreignWorkspaceId, { kind: 'agent', id: agent.id }, repoId)).toEqual([]);
      expect(await repo.usageForRepo(foreignWorkspaceId, repoId)).toEqual([]);
    });

    it('does not touch agent/skill versions on save (AC-23)', async () => {
      const agent = await newAgent('A-version');
      const skill = await newSkill('S-version');
      const versions = async () => ({
        agent: (await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id)))[0]!.version,
        skill: (await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id)))[0]!.version,
        agentVersions: (await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id))).length,
        skillVersions: (await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id))).length,
      });
      const before = await versions();
      await repo.replaceAttachments(workspaceId, { kind: 'agent', id: agent.id }, repoId, ['docs/a.md']);
      await repo.replaceAttachments(workspaceId, { kind: 'skill', id: skill.id }, repoId, ['docs/a.md']);
      expect(await versions()).toEqual(before);
    });

    it('lists skill attachments per skill in order and agent skill links with both enable flags', async () => {
      const agent = await newAgent('A-links');
      const s1 = await newSkill('S-one');
      const s2 = await newSkill('S-two', workspaceId, false);
      await pg.handle.db.insert(t.agentSkills).values([
        { agentId: agent.id, skillId: s2.id, enabled: true, order: 1 },
        { agentId: agent.id, skillId: s1.id, enabled: false, order: 0 },
      ]);
      await repo.replaceAttachments(workspaceId, { kind: 'skill', id: s1.id }, repoId, ['docs/2.md', 'docs/1.md']);
      expect(await repo.listSkillAttachments(workspaceId, [s1.id, s2.id], repoId)).toEqual({
        [s1.id]: ['docs/2.md', 'docs/1.md'],
      });
      expect(await repo.listSkillAttachments(workspaceId, [], repoId)).toEqual({});
      expect(await repo.agentSkillLinks(workspaceId, agent.id)).toEqual([
        { skillId: s1.id, skillName: 'S-one', linkEnabled: false, skillEnabled: true },
        { skillId: s2.id, skillName: 'S-two', linkEnabled: true, skillEnabled: false },
      ]);
      expect(await repo.agentSkillLinks(foreignWorkspaceId, agent.id)).toEqual([]);
    });

    it('usage counts disabled agents and skills and splits direct vs via-skill', async () => {
      const direct = await newAgent('U-direct');
      const disabled = await newAgent('U-disabled', workspaceId, false);
      const viaSkill = await newAgent('U-via');
      const skill = await newSkill('U-skill', workspaceId, false);
      await pg.handle.db.insert(t.agentSkills).values([
        { agentId: viaSkill.id, skillId: skill.id, enabled: false, order: 0 },
      ]);
      const path = 'docs/usage-only.md';
      await repo.replaceAttachments(workspaceId, { kind: 'agent', id: direct.id }, repoId, [path]);
      await repo.replaceAttachments(workspaceId, { kind: 'agent', id: disabled.id }, repoId, [path]);
      await repo.replaceAttachments(workspaceId, { kind: 'skill', id: skill.id }, repoId, [path]);
      await repo.replaceAttachments(workspaceId, { kind: 'agent', id: direct.id }, otherRepoId, [path]);

      const rows = (await repo.usageForRepo(workspaceId, repoId)).filter((r) => r.path === path);
      const key = (r: (typeof rows)[number]) => `${r.agentName}|${r.via}|${r.skillName ?? ''}`;
      expect(rows.map(key).sort()).toEqual(['U-direct|direct|', 'U-disabled|direct|', 'U-via|skill|U-skill']);
    });

    it('deleting an agent, a skill or a repo removes its attachments (AC-49)', async () => {
      const agent = await newAgent('D-agent');
      const skill = await newSkill('D-skill');
      const [tmpRepo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'tmp', fullName: 'acme/tmp' })
        .returning();
      const count = async (where: ReturnType<typeof eq>) =>
        (await pg.handle.db.select().from(t.projectContextAttachments).where(where)).length;
      const a = t.projectContextAttachments;

      await repo.replaceAttachments(workspaceId, { kind: 'agent', id: agent.id }, repoId, ['docs/a.md']);
      await repo.replaceAttachments(workspaceId, { kind: 'skill', id: skill.id }, repoId, ['docs/a.md']);
      await repo.replaceAttachments(workspaceId, { kind: 'agent', id: agent.id }, tmpRepo!.id, ['docs/a.md']);
      expect(await count(eq(a.agentId, agent.id))).toBe(2);

      await pg.handle.db.delete(t.repos).where(eq(t.repos.id, tmpRepo!.id));
      expect(await count(eq(a.repoId, tmpRepo!.id))).toBe(0);
      expect(await count(eq(a.agentId, agent.id))).toBe(1);

      await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent.id));
      expect(await count(eq(a.agentId, agent.id))).toBe(0);

      await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skill.id));
      expect(await count(eq(a.skillId, skill.id))).toBe(0);
    });
  });

  describe('routes', () => {
    const SHA = 'a1b2c3d4';
    const DOCS = {
      'docs/arch.md': '# Architecture\n\nmodule `api/` must not import `db/` directly',
      '.devdigest/specs/feature.md': '# Feature\n',
      'docs/link.md': 'a.md',
    };
    const tree = [
      { path: 'docs/arch.md', mode: '100644', size: DOCS['docs/arch.md'].length, sha: '1'.repeat(40) },
      { path: '.devdigest/specs/feature.md', mode: '100644', size: 10, sha: '2'.repeat(40) },
      { path: 'docs/link.md', mode: '120000', size: 4, sha: '3'.repeat(40) },
      { path: 'README.md', mode: '100644', size: 5, sha: '4'.repeat(40) },
    ];
    const filesAt = Object.fromEntries(Object.entries(DOCS).map(([p, c]) => [`${SHA}:${p}`, c]));
    const open: Awaited<ReturnType<typeof buildApp>>[] = [];

    async function appWith(git: MockGitClient) {
      const app = await buildApp({
        config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        db: pg.handle.db,
        overrides: { git, github: new MockGitHubClient(), llm: { openrouter: new MockLLMProvider('openrouter') } },
      });
      open.push(app);
      return app;
    }
    afterAll(async () => {
      await Promise.all(open.map((a) => a.close()));
    });

    it('GET listing returns documents, totals and limits; GET document returns used_by with direct and via-skill markers', async () => {
      const app = await appWith(new MockGitClient({ tree, filesAt }));
      const agent = await newAgent('R-agent');
      const skill = await newSkill('R-skill');
      const viaAgent = await newAgent('R-via');
      await pg.handle.db.insert(t.agentSkills).values({ agentId: viaAgent.id, skillId: skill.id, enabled: true, order: 0 });

      const put = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/project-context`,
        payload: { repo_id: repoId, paths: ['docs/arch.md'] },
      });
      expect(put.statusCode).toBe(200);
      const putSkill = await app.inject({
        method: 'PUT',
        url: `/skills/${skill.id}/project-context`,
        payload: { repo_id: repoId, paths: ['docs/arch.md', '.devdigest/specs/feature.md'] },
      });
      expect(putSkill.statusCode).toBe(200);

      const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/project-context` });
      expect(list.statusCode).toBe(200);
      const body = list.json();
      expect(body.documents.map((d: { path: string }) => d.path)).toEqual(['.devdigest/specs/feature.md', 'docs/arch.md']);
      expect(body.total_files).toBe(2);
      expect(body.total_tokens).toBe(body.documents.reduce((s: number, d: { tokens: number }) => s + d.tokens, 0));
      expect(body.limits).toEqual({ doc_cap_tokens: 3000, run_budget_tokens: 7500, max_attachments: 50 });
      const arch = body.documents.find((d: { path: string }) => d.path === 'docs/arch.md');
      expect(arch.used_by_agents).toBe(2);

      const doc = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/project-context/document?path=${encodeURIComponent('docs/arch.md')}`,
      });
      expect(doc.statusCode).toBe(200);
      expect(doc.json()).toMatchObject({ path: 'docs/arch.md', type: 'docs', content: DOCS['docs/arch.md'], tokens: arch.tokens });
      expect(doc.json().used_by).toEqual([
        { agent_id: agent.id, agent_name: 'R-agent', via: 'direct', skill_name: null },
        { agent_id: viaAgent.id, agent_name: 'R-via', via: 'skill', skill_name: 'R-skill' },
      ]);

      const agentView = await app.inject({ method: 'GET', url: `/agents/${viaAgent.id}/project-context?repo_id=${repoId}` });
      expect(agentView.statusCode).toBe(200);
      expect(agentView.json().inherited.map((d: { path: string }) => d.path)).toEqual(['docs/arch.md', '.devdigest/specs/feature.md']);
      const skillView = await app.inject({ method: 'GET', url: `/skills/${skill.id}/project-context?repo_id=${repoId}` });
      expect(skillView.json().items.map((i: { path: string }) => i.path)).toEqual(['docs/arch.md', '.devdigest/specs/feature.md']);
    });

    it('PUT rejects a path outside the listing with 422 and leaves the set unchanged (AC-26)', async () => {
      const app = await appWith(new MockGitClient({ tree, filesAt }));
      const agent = await newAgent('R-422');
      const ok = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/project-context`,
        payload: { repo_id: repoId, paths: ['docs/arch.md'] },
      });
      expect(ok.statusCode).toBe(200);
      for (const bad of ['docs/link.md', 'README.md', '../etc/x.md', 'docs/none.md']) {
        const res = await app.inject({
          method: 'PUT',
          url: `/agents/${agent.id}/project-context`,
          payload: { repo_id: repoId, paths: ['.devdigest/specs/feature.md', bad] },
        });
        expect(res.statusCode).toBe(422);
      }
      const dup = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/project-context`,
        payload: { repo_id: repoId, paths: ['docs/arch.md', 'docs/arch.md'] },
      });
      expect(dup.statusCode).toBe(422);
      const notUuid = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/project-context`,
        payload: { repo_id: 'nope', paths: [] },
      });
      expect(notUuid.statusCode).toBe(422);
      const after = await app.inject({ method: 'GET', url: `/agents/${agent.id}/project-context?repo_id=${repoId}` });
      expect(after.json().items.map((i: { path: string }) => i.path)).toEqual(['docs/arch.md']);
    });

    it('cross-workspace ids and unknown documents are 404 and change nothing (AC-48)', async () => {
      const app = await appWith(new MockGitClient({ tree, filesAt }));
      const agent = await newAgent('R-404');
      const foreignAgent = await newAgent('R-foreign', foreignWorkspaceId);
      const foreignSkill = await newSkill('R-foreign-skill', foreignWorkspaceId);

      const list = await app.inject({ method: 'GET', url: `/repos/${foreignRepoId}/project-context` });
      expect(list.statusCode).toBe(404);
      const putForeignRepo = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/project-context`,
        payload: { repo_id: foreignRepoId, paths: [] },
      });
      expect(putForeignRepo.statusCode).toBe(404);
      const putForeignAgent = await app.inject({
        method: 'PUT',
        url: `/agents/${foreignAgent.id}/project-context`,
        payload: { repo_id: repoId, paths: ['docs/arch.md'] },
      });
      expect(putForeignAgent.statusCode).toBe(404);
      const getForeignSkill = await app.inject({
        method: 'GET',
        url: `/skills/${foreignSkill.id}/project-context?repo_id=${repoId}`,
      });
      expect(getForeignSkill.statusCode).toBe(404);
      const missingDoc = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/project-context/document?path=${encodeURIComponent('docs/link.md')}`,
      });
      expect(missingDoc.statusCode).toBe(404);
      expect(await repo.listAttachments(foreignWorkspaceId, { kind: 'agent', id: foreignAgent.id }, repoId)).toEqual([]);
      expect(await repo.listAttachments(workspaceId, { kind: 'agent', id: foreignAgent.id }, repoId)).toEqual([]);
    });

    it('a missing clone is a distinct 503 (AC-11)', async () => {
      const git = new MockGitClient();
      git.listTree = async () => {
        throw new Error('no clone');
      };
      const app = await appWith(git);
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/project-context` });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('project_context_repo_unavailable');
    });
  });
});
