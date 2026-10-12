import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { PrBriefRecord } from '@devdigest/shared';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { BriefRepository } from '../src/modules/brief/repository.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) console.warn('[brief.repository] Docker not available - skipping integration tests.');

function record(over: Partial<PrBriefRecord> = {}): PrBriefRecord {
  return {
    summary: 'Adds a limiter.',
    risks: [{ file_refs: ['src/a.ts'], explanation: 'e', title: 't', kind: 'k', severity: 'low' }],
    review_focus: [{ file: 'src/a.ts', line: 3, reason: 'check' }],
    head_sha: 'sha-1',
    generated_at: '2026-10-10T00:00:00.000Z',
    provider: 'openai',
    model: 'gpt-4.1',
    usage: { tokens_in: 1, tokens_out: 2, cost_usd: null, attempts: 1, input_tokens_total: 10, input_tokens_by_source: { specs: 4 } },
    reductions: [],
    facts: {
      intent: 'present',
      blast: { status: 'present' },
      linked_issue: 'none',
      description: 'present',
      specs: { status: 'no_agent', agent: null, included_paths: [], omitted_paths: [] },
    },
    grounding: { risks_dropped: 0, risk_refs_removed: 0, focus_dropped: 0, focus_lines_snapped: 0 },
    ...over,
  };
}

d('BriefRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: BriefRepository;
  let workspaceId: string;
  let repoId: string;
  let prId: string;
  let foreignWorkspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    repo = new BriefRepository(pg.handle.db);
    const db = pg.handle.db;
    const [r] = await db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = r!.id;
    const [pr] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
    prId = pr!.id;
    await db.delete(t.prBrief).where(eq(t.prBrief.prId, prId));
    const [foreign] = await db.insert(t.workspaces).values({ name: 'foreign-brief-ws' }).returning();
    foreignWorkspaceId = foreign!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('loadPull returns the PR, repo and files with patches; undefined across workspaces', async () => {
    const data = await repo.loadPull(workspaceId, prId);
    expect(data?.pull.id).toBe(prId);
    expect(data?.repo).toMatchObject({ id: repoId, owner: 'acme', name: 'payments-api' });
    expect(data!.files.length).toBeGreaterThan(0);
    expect(data!.files[0]).toHaveProperty('patch');
    expect(await repo.loadPull(foreignWorkspaceId, prId)).toBeUndefined();
  });

  it('save then getStored round-trips, upsert replaces, and other workspaces see nothing', async () => {
    expect(await repo.getStored(workspaceId, prId)).toBeUndefined();
    await repo.save(workspaceId, prId, record());
    expect(await repo.getStored(workspaceId, prId)).toEqual(record());
    await repo.save(workspaceId, prId, record({ summary: 'Second.', head_sha: 'sha-2' }));
    const stored = await repo.getStored(workspaceId, prId);
    expect(stored?.summary).toBe('Second.');
    expect(stored?.head_sha).toBe('sha-2');
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(rows).toHaveLength(1);
    expect(await repo.getStored(foreignWorkspaceId, prId)).toBeUndefined();
    await expect(repo.save(foreignWorkspaceId, prId, record())).rejects.toMatchObject({ statusCode: 404 });
    expect((await repo.getStored(workspaceId, prId))?.summary).toBe('Second.');
  });

  it('treats an unparsable stored row as no brief', async () => {
    await pg.handle.db.update(t.prBrief).set({ json: { nonsense: true } }).where(eq(t.prBrief.prId, prId));
    expect(await repo.getStored(workspaceId, prId)).toBeUndefined();
  });

  it('latestRunAgent picks the most recent run of any status and skips deleted agents', async () => {
    const db = pg.handle.db;
    const mkAgent = async (name: string) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
          .returning()
      )[0]!;
    const older = await mkAgent('brief-older');
    const newer = await mkAgent('brief-newer');
    const doomed = await mkAgent('brief-doomed');
    await db.delete(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    await db.insert(t.agentRuns).values([
      { workspaceId, agentId: older.id, prId, ranAt: new Date('2026-01-01T00:00:00Z'), status: 'done' },
      { workspaceId, agentId: newer.id, prId, ranAt: new Date('2026-02-01T00:00:00Z'), status: 'failed' },
      { workspaceId, agentId: doomed.id, prId, ranAt: new Date('2026-03-01T00:00:00Z'), status: 'done' },
    ]);
    expect(await repo.latestRunAgent(workspaceId, repoId)).toEqual({ id: doomed.id, name: 'brief-doomed' });
    await db.delete(t.agents).where(eq(t.agents.id, doomed.id));
    expect(await repo.latestRunAgent(workspaceId, repoId)).toEqual({ id: newer.id, name: 'brief-newer' });
    expect(await repo.latestRunAgent(foreignWorkspaceId, repoId)).toBeUndefined();
  });

  it('enabledSkills honours both the per-agent and the workspace-wide enable flag, in order', async () => {
    const db = pg.handle.db;
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'skill-agent', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
      .returning();
    const mkSkill = async (name: string, enabled: boolean) =>
      (
        await db
          .insert(t.skills)
          .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b', enabled })
          .returning()
      )[0]!;
    const a = await mkSkill('skill-a', true);
    const b = await mkSkill('skill-b', true);
    const off = await mkSkill('skill-off-global', false);
    const offAgent = await mkSkill('skill-off-agent', true);
    await db.insert(t.agentSkills).values([
      { agentId: agent!.id, skillId: b.id, enabled: true, order: 2 },
      { agentId: agent!.id, skillId: a.id, enabled: true, order: 1 },
      { agentId: agent!.id, skillId: off.id, enabled: true, order: 3 },
      { agentId: agent!.id, skillId: offAgent.id, enabled: false, order: 4 },
    ]);
    expect(await repo.enabledSkills(workspaceId, agent!.id)).toEqual([
      { skillId: a.id, name: 'skill-a' },
      { skillId: b.id, name: 'skill-b' },
    ]);
    expect(await repo.enabledSkills(foreignWorkspaceId, agent!.id)).toEqual([]);
  });
});
