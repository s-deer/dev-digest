/**
 * Smart Diff (L03) route — GET /pulls/:id/smart-diff, on the seeded PR #482
 * (server/src/db/seed.ts): 4 pr_files, one kind='review' review with a
 * CRITICAL finding at src/config.ts:12 and a WARNING at src/api/users.ts:45.
 * Modeled on `test/intent.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { SmartDiff } from '@devdigest/shared';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) console.warn('[smart-diff] Docker not available - skipping integration tests.');

d('smart-diff route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    prId = pr!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function app() {
    return buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), db: pg.handle.db });
  }

  it('groups the seeded PR by role and attaches the latest review\'s findings, excluding dismissed ones', async () => {
    // The seeded review has a WARNING at src/api/users.ts:45-52; dismiss it to
    // prove dismissed findings are excluded.
    await pg.handle.db
      .update(t.findings)
      .set({ dismissedAt: new Date() })
      .where(and(eq(t.findings.file, 'src/api/users.ts'), eq(t.findings.startLine, 45)));

    const server = await app();
    const res = await server.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(SmartDiff.safeParse(body).success).toBe(true);

    const allFiles = body.groups.flatMap((g: { files: { path: string; finding_lines: number[] }[] }) => g.files);
    const config = allFiles.find((f: { path: string }) => f.path === 'src/config.ts');
    expect(config?.finding_lines).toContain(12);

    const users = allFiles.find((f: { path: string }) => f.path === 'src/api/users.ts');
    expect(users?.finding_lines).toEqual([]); // dismissed finding excluded

    await server.close();
  });

  it('uses only the newest kind=review review, not an older one', async () => {
    // Insert a newer review with a finding on a different file/line — the
    // route must reflect this one, not the seeded (now older) review.
    const [newerReview] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', model: 'seed-newer' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: newerReview!.id,
      file: 'src/middleware/ratelimit.ts',
      startLine: 20,
      endLine: 20,
      severity: 'SUGGESTION',
      category: 'style',
      title: 'Newer review finding',
      rationale: 'From the newer review.',
      confidence: 0.5,
    });

    const server = await app();
    const res = await server.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const allFiles = body.groups.flatMap((g: { files: { path: string; finding_lines: number[] }[] }) => g.files);
    const ratelimit = allFiles.find((f: { path: string }) => f.path === 'src/middleware/ratelimit.ts');
    expect(ratelimit?.finding_lines).toEqual([20]);
    // The seeded review's finding at src/config.ts:12 is now from the older review.
    const config = allFiles.find((f: { path: string }) => f.path === 'src/config.ts');
    expect(config?.finding_lines).toEqual([]);

    await server.close();
  });

  it('404s for an unknown PR', async () => {
    const server = await app();
    const res = await server.inject({
      method: 'GET',
      url: `/pulls/00000000-0000-0000-0000-000000000000/smart-diff`,
    });
    expect(res.statusCode).toBe(404);
    await server.close();
  });

  it('404s for a PR that belongs to a different workspace (A1: loadInputs is workspace-scoped)', async () => {
    const [foreignWorkspace] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'foreign-smart-diff-ws' })
      .returning();
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

    const server = await app();
    const res = await server.inject({ method: 'GET', url: `/pulls/${foreignPr!.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await server.close();
  });
});
