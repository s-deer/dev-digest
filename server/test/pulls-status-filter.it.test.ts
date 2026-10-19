/**
 * GET /repos/:id/pulls?status= — review-status filter. DB-backed (Testcontainers
 * Postgres), GitHub mocked with a counting client so we can prove an invalid
 * filter does no I/O and a valid one makes the same calls as an unfiltered read.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { ConfigError } from '../src/platform/errors.js';
import { STALE_DAYS } from '../src/modules/pulls/status.js';
import * as t from '../src/db/schema.js';
import { PR_LIST_STATUSES, type PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

class CountingGitHub extends MockGitHubClient {
  listCalls = 0;
  getCalls = 0;
  constructor() {
    super({ pulls: [] });
  }
  override async listPullRequests(...a: Parameters<MockGitHubClient['listPullRequests']>) {
    this.listCalls += 1;
    return super.listPullRequests(...a);
  }
  override async getPullRequest(...a: Parameters<MockGitHubClient['getPullRequest']>) {
    this.getCalls += 1;
    return super.getPullRequest(...a);
  }
}

const DAY = 86_400_000;
let repoSeq = 0;

d('GET /repos/:id/pulls?status= (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const mkApp = async () => {
    const gh = new CountingGitHub();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    return { app, gh };
  };

  /** One repo with PRs 1..5 = needs_review, reviewed, stale, merged, closed. */
  async function seedRepo(ws = workspaceId) {
    const db = pg.handle.db;
    const name = `filter-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const base = {
      workspaceId: ws,
      repoId: repo!.id,
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      additions: 3,
      deletions: 1,
      filesCount: 1,
    };
    const fresh = new Date();
    const old = new Date(Date.now() - (STALE_DAYS + 3) * DAY);
    await db.insert(t.pullRequests).values([
      { ...base, number: 1, title: 'nr', headSha: 'h1', lastReviewedSha: null, status: 'open', updatedAt: fresh },
      { ...base, number: 2, title: 'rv', headSha: 'h2', lastReviewedSha: 'h2', status: 'open', updatedAt: fresh },
      { ...base, number: 3, title: 'st', headSha: 'h3', lastReviewedSha: 'h3', status: 'open', updatedAt: old },
      // zeroed stats so the diff-stat backfill calls getPullRequest
      { ...base, number: 4, title: 'mg', headSha: 'h4', additions: 0, deletions: 0, filesCount: 0, status: 'merged', updatedAt: fresh },
      { ...base, number: 5, title: 'cl', headSha: 'h5', status: 'closed', updatedAt: fresh },
    ]);
    return repo!;
  }

  const list = async (app: Awaited<ReturnType<typeof buildApp>>, id: string, qs = '') =>
    app.inject({ method: 'GET', url: `/repos/${id}/pulls${qs}` });
  const nums = (rows: PrMeta[]) => rows.map((r) => r.number);

  it('unfiltered returns all five derived statuses; empty ?status= is identical', async () => {
    const { app } = await mkApp();
    const repo = await seedRepo();
    const all = await list(app, repo.id);
    expect(all.statusCode).toBe(200);
    const rows = all.json() as PrMeta[];
    expect(rows.map((r) => r.status).sort()).toEqual([...PR_LIST_STATUSES].sort());
    const empty = await list(app, repo.id, '?status=');
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual(rows);
  });

  it('?status=needs_review,stale is the order-preserving subsequence; repeated param is the union; all five equals unfiltered', async () => {
    const { app } = await mkApp();
    const repo = await seedRepo();
    const all = (await list(app, repo.id)).json() as PrMeta[];

    const res = await list(app, repo.id, '?status=needs_review,stale');
    expect(res.statusCode).toBe(200);
    const sub = res.json() as PrMeta[];
    expect(sub.every((r) => ['needs_review', 'stale'].includes(r.status))).toBe(true);
    expect(sub).toEqual(all.filter((r) => ['needs_review', 'stale'].includes(r.status)));
    expect(sub.length).toBe(2);

    const rep = (await list(app, repo.id, '?status=stale&status=merged')).json() as PrMeta[];
    expect(rep.map((r) => r.status).sort()).toEqual(['merged', 'stale']);

    const five = (await list(app, repo.id, `?status=${PR_LIST_STATUSES.join(',')}`)).json();
    expect(five).toEqual(all);
  });

  it('a valid filter matching nothing returns 200 []', async () => {
    const { app } = await mkApp();
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `empty-${repoSeq++}`, fullName: `acme/empty-${repoSeq}` })
      .returning();
    const res = await list(app, repo!.id, '?status=stale');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("unknown repo and another workspace's repo with a valid filter return 404", async () => {
    const { app } = await mkApp();
    const missing = await list(app, randomUUID(), '?status=stale');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const foreign = await seedRepo(other!.id);
    const res = await list(app, foreign.id, '?status=stale');
    expect(res.statusCode).toBe(404);
  });

  it('invalid values return 422 naming them with { invalid, allowed }', async () => {
    const { app } = await mkApp();
    const repo = await seedRepo();
    const res = await list(app, repo.id, '?status=stale,bogus,bogus');
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('bogus');
    expect(body.error.details).toEqual({ invalid: ['bogus'], allowed: [...PR_LIST_STATUSES] });
    for (const bad of ['Stale', 'open']) {
      const r = await list(app, repo.id, `?status=${bad}`);
      expect(r.statusCode).toBe(422);
      expect(r.json().error.details.invalid).toEqual([bad]);
    }
  });

  it('invalid filter does no GitHub calls and no writes, for a real and an unknown repo', async () => {
    const { app, gh } = await mkApp();
    const repo = await seedRepo();
    const db = pg.handle.db;
    const before = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo.id));

    for (const id of [repo.id, randomUUID()]) {
      const res = await list(app, id, '?status=bogus');
      expect(res.statusCode).toBe(422);
    }
    expect(gh.listCalls).toBe(0);
    expect(gh.getCalls).toBe(0);
    const after = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo.id));
    expect(after).toEqual(before);
  });

  it('a valid filter makes the same GitHub calls as an unfiltered request', async () => {
    const a = await mkApp();
    const repoA = await seedRepo();
    await list(a.app, repoA.id);
    const b = await mkApp();
    const repoB = await seedRepo();
    await list(b.app, repoB.id, '?status=stale');
    expect(b.gh.listCalls).toBe(a.gh.listCalls);
    expect(b.gh.getCalls).toBe(a.gh.getCalls);
    expect(a.gh.listCalls).toBe(1);
    expect(a.gh.getCalls).toBeGreaterThan(0);
  });

  it('changing lastReviewedSha / updatedAt moves a PR between filtered results', async () => {
    const { app } = await mkApp();
    const repo = await seedRepo();
    const db = pg.handle.db;
    const only = async (s: string) =>
      nums((await list(app, repo.id, `?status=${s}`)).json() as PrMeta[]);

    expect(await only('needs_review')).toEqual([1]);
    await db
      .update(t.pullRequests)
      .set({ lastReviewedSha: 'h1' })
      .where(eq(t.pullRequests.repoId, repo.id));
    // head matches now for PR 1 only where headSha === 'h1'; others unchanged semantics
    const reviewed = await only('reviewed');
    expect(reviewed).toContain(1);
    expect(await only('needs_review')).not.toContain(1);

    await db
      .update(t.pullRequests)
      .set({ updatedAt: new Date(Date.now() - (STALE_DAYS + 5) * DAY) })
      .where(eq(t.pullRequests.repoId, repo.id));
    expect(await only('stale')).toContain(1);
    expect(await only('reviewed')).not.toContain(1);
  });
  // ---- EC-15 / AC-19: GitHub unavailable → filter applies to persisted PRs ----
  it.each([
    [
      'client unavailable (container.github() throws)',
      (app: Awaited<ReturnType<typeof buildApp>>) => {
        app.container.github = async () => {
          throw new ConfigError('GITHUB_TOKEN is not configured');
        };
      },
    ],
    [
      'listPullRequests rejects',
      (app: Awaited<ReturnType<typeof buildApp>>) => {
        app.container.github = async () => {
          const gh = new CountingGitHub();
          gh.listPullRequests = async () => {
            throw new Error('network down');
          };
          return gh;
        };
      },
    ],
  ])('offline (%s): filter returns exactly the persisted PRs of that status, in unfiltered order', async (_n, breakGh) => {
    const { app } = await mkApp();
    breakGh(app);
    const repo = await seedRepo();
    const all = await list(app, repo.id);
    expect(all.statusCode).toBe(200);
    const allRows = all.json() as PrMeta[];
    expect(allRows).toHaveLength(5);

    const stale = await list(app, repo.id, '?status=stale');
    expect(stale.statusCode).toBe(200);
    expect(nums(stale.json() as PrMeta[])).toEqual([3]);

    const subset = await list(app, repo.id, '?status=stale,needs_review,closed');
    expect(subset.statusCode).toBe(200);
    expect(subset.json()).toEqual(
      allRows.filter((r) => ['stale', 'needs_review', 'closed'].includes(r.status)),
    );
    expect((subset.json() as PrMeta[]).length).toBe(3);
  });

  // ---- AC-19: persistence identical with and without a filter ----
  it('a valid filter persists exactly the same pull_requests rows as an unfiltered request', async () => {
    const synced = (): PrMeta[] => [
      {
        number: 1, title: 'nr renamed', author: 'dev', branch: 'feat/x', base: 'main',
        head_sha: 'h1-new', additions: 7, deletions: 2, files_count: 2, status: 'open',
        opened_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-04T00:00:00Z',
      },
      {
        number: 6, title: 'brand new', author: 'dev2', branch: 'feat/y', base: 'main',
        head_sha: 'h6', additions: 5, deletions: 1, files_count: 1, status: 'open',
        opened_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
      },
    ];
    const run = async (qs: string) => {
      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: { github: new MockGitHubClient({ pulls: synced() }) },
      });
      const repo = await seedRepo();
      const res = await list(app, repo.id, qs);
      expect(res.statusCode).toBe(200);
      const rows = await pg.handle.db
        .select()
        .from(t.pullRequests)
        .where(eq(t.pullRequests.repoId, repo.id));
      return rows
        .map(({ id: _i, repoId: _r, createdAt: _c, ...rest }) =>
          // seedRepo stamps wall-clock updatedAt on untouched rows; only GitHub-supplied ones are comparable
          rest.number === 1 || rest.number === 6 ? rest : { ...rest, updatedAt: null },
        )
        .sort((a, b) => a.number - b.number);
    };
    const unfiltered = await run('');
    const filtered = await run('?status=stale');
    expect(unfiltered.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(unfiltered.find((r) => r.number === 1)!.title).toBe('nr renamed');
    expect(unfiltered.find((r) => r.number === 1)!.headSha).toBe('h1-new');
    expect(filtered).toEqual(unfiltered);
  });

  // ---- EC-3: HTTP decoding of whitespace in the filter ----
  it('percent-encoded and plus-encoded spaces around values are trimmed like the plain form', async () => {
    const { app } = await mkApp();
    const repo = await seedRepo();
    const plain = await list(app, repo.id, '?status=needs_review,stale');
    expect(nums(plain.json() as PrMeta[])).toEqual(
      nums((await list(app, repo.id)).json() as PrMeta[]).filter((n) => n === 1 || n === 3),
    );
    const pct = await list(app, repo.id, '?status=%20needs_review%20,%20stale');
    expect(pct.statusCode).toBe(200);
    expect(pct.json()).toEqual(plain.json());

    const plus = await list(app, repo.id, '?status=+stale+');
    expect(plus.statusCode).toBe(200);
    expect(plus.json()).toEqual((await list(app, repo.id, '?status=stale')).json());
    expect(nums(plus.json() as PrMeta[])).toEqual([3]);
  });
});
