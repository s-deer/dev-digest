import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, reusable demo skills, and the built-in reviewers, all on
 * the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the remaining tables (memory, eval, …) once their
 * features are built; conventions include a small read-only demo scan below.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- convention extractor demo scan (read-only browser fixture) ---------
  const demoScanId = '00000000-0000-0000-0000-000000000101';
  await db
    .insert(t.conventionScans)
    .values({
      id: demoScanId,
      workspaceId,
      repoId,
      status: 'done',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      sampledFiles: ['package.json', 'src/api/users.ts', 'src/middleware/ratelimit.ts'],
      proposed: 3,
      kept: 3,
      droppedUngrounded: 0,
      droppedDuplicate: 0,
      costUsd: 0.001,
      startedAt: new Date('2026-09-19T08:00:00.000Z'),
      finishedAt: new Date('2026-09-19T08:00:45.000Z'),
    })
    .onConflictDoNothing();
  await db
    .insert(t.conventions)
    .values([
      {
        id: '00000000-0000-0000-0000-000000000111',
        workspaceId,
        repoId,
        scanId: demoScanId,
        category: 'api',
        rule: 'Validate request bodies at the route boundary with the shared schema.',
        rationale: 'Routes reject malformed input before service logic runs.',
        evidencePath: 'src/api/users.ts',
        evidenceLine: 18,
        evidenceSnippet: 'schema: { body: CreateUserBody }',
        confidence: 0.94,
        status: 'accepted',
      },
      {
        id: '00000000-0000-0000-0000-000000000112',
        workspaceId,
        repoId,
        scanId: demoScanId,
        category: 'errors',
        rule: 'Translate domain failures into the shared error envelope.',
        rationale: 'Clients can render stable error codes instead of parsing strings.',
        evidencePath: 'src/api/users.ts',
        evidenceLine: 31,
        evidenceSnippet: 'throw new ValidationError("User is invalid")',
        confidence: 0.88,
        status: 'pending',
      },
      {
        id: '00000000-0000-0000-0000-000000000113',
        workspaceId,
        repoId,
        scanId: demoScanId,
        category: 'structure',
        rule: 'Keep external integrations behind injected adapters.',
        rationale: 'Services remain testable without network credentials.',
        evidencePath: 'src/middleware/ratelimit.ts',
        evidenceLine: 9,
        evidenceSnippet: 'constructor(private readonly limiter: RateLimiter) {}',
        confidence: 0.82,
        status: 'pending',
      },
    ])
    .onConflictDoNothing();

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- reusable demo skills -----------------------------------------------
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'Test Quality Rubric',
      description: 'Directs a reviewer to inspect test coverage, corner cases, mocks, and flakes.',
      type: 'rubric',
      source: 'manual',
      body: `# Test quality\nInspect changed tests for untested branches and boundary values. Flag happy-path-only coverage when the changed production code has error, false, empty, or limit branches. Flag mocks that replace the behaviour under test and assertions that do not prove an observable result.`,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'API Contract Compatibility',
      description: 'Directs a reviewer to identify breaking route contract changes.',
      type: 'convention',
      source: 'extracted',
      body: `# API contract compatibility\nTreat a changed route path, HTTP method, request field, response field, status code, or nullability as a potential breaking change. Flag it when the diff does not update every visible caller, contract, or migration path required to preserve compatibility.`,
      enabled: true,
      version: 1,
    },
  ];
  for (const skill of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, skill.name)));
    if (!existing) {
      // One transaction: a skill without its v1 snapshot is skipped by re-runs.
      await db.transaction(async (tx) => {
        const [created] = await tx.insert(t.skills).values(skill).returning();
        await tx
          .insert(t.skillVersions)
          .values({ skillId: created!.id, version: 1, body: created!.body, note: 'Seeded demo skill' });
      });
    }
  }

  // ---- built-in agents -----------------------------------------------------
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Checks tests for missing branches, corner cases, brittle mocks, and flakes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Detects breaking route and payload contract changes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // The demo skills stay UNATTACHED: the Test Quality / API Contract agents get
  // their skills through the UI (create or import), and a run without skills is
  // the control case of the skills experiment.

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
