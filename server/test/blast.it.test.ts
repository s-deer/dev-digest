/**
 * Blast radius (L04) route — GET /pulls/:id/blast, on the seeded PR #482
 * (server/src/db/seed.ts): 4 pr_files (src/middleware/ratelimit.ts,
 * src/api/public/webhooks.ts, src/config.ts, src/api/users.ts). Modeled on
 * `test/smart-diff.it.test.ts`, with a fake `repoIntel` override so the test
 * never touches the real facade/index.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { BlastRadiusResponse } from '@devdigest/shared';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) console.warn('[blast] Docker not available - skipping integration tests.');

const SEEDED_FILES = [
  'src/middleware/ratelimit.ts',
  'src/api/public/webhooks.ts',
  'src/config.ts',
  'src/api/users.ts',
];

d('blast route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
    prId = pr!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  /** Fake `RepoIntel` slice: records every call and returns a fixed
   *  `BlastResult` so the route's mapping + response validation is exercised
   *  without touching the real facade/index. */
  class FakeRepoIntel implements Pick<RepoIntel, 'getBlastRadius'> {
    calls: Array<{ repoId: string; changedFiles: string[] }> = [];

    async getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
      this.calls.push({ repoId, changedFiles });
      return {
        changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimiter', kind: 'function' }],
        callers: [
          { file: 'src/api/public/webhooks.ts', symbol: 'handleWebhook', viaSymbol: 'rateLimiter', line: 12, rank: 5 },
          { file: 'src/api/users.ts', symbol: 'listUsers', viaSymbol: 'rateLimiter', line: 30, rank: 2 },
        ],
        impactedEndpoints: ['GET /users', 'POST /webhooks'],
        factsByFile: {
          'src/api/public/webhooks.ts': { endpoints: ['POST /webhooks'], crons: [] },
          'src/api/users.ts': { endpoints: ['GET /users'], crons: ['nightly-cleanup'] },
        },
        degraded: false,
      };
    }
  }

  function app(repoIntel: FakeRepoIntel) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { repoIntel },
    });
  }

  it('200s with a BlastRadiusResponse-shaped body, calling the facade exactly once with the seeded files', async () => {
    const repoIntel = new FakeRepoIntel();
    const server = await app(repoIntel);

    const res = await server.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(BlastRadiusResponse.safeParse(body).success).toBe(true);

    expect(repoIntel.calls).toHaveLength(1);
    expect(repoIntel.calls[0]!.repoId).toBe(repoId);
    expect([...repoIntel.calls[0]!.changedFiles].sort()).toEqual([...SEEDED_FILES].sort());

    const foo = body.downstream.find((d: { symbol: string }) => d.symbol === 'rateLimiter');
    expect(foo.callers.length).toBeGreaterThanOrEqual(2);
    expect(foo.endpoints_affected).toContain('GET /users');
    expect(body.degraded).toBe(false);

    await server.close();
  });

  it('404s for an unknown PR', async () => {
    const server = await app(new FakeRepoIntel());
    const res = await server.inject({
      method: 'GET',
      url: `/pulls/00000000-0000-0000-0000-000000000000/blast`,
    });
    expect(res.statusCode).toBe(404);
    await server.close();
  });

  it('422s for a non-uuid PR id', async () => {
    const server = await app(new FakeRepoIntel());
    const res = await server.inject({ method: 'GET', url: `/pulls/not-a-uuid/blast` });
    expect(res.statusCode).toBe(422);
    await server.close();
  });
});
