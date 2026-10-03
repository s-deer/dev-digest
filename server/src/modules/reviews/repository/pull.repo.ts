import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

/**
 * Resolve a PR by its GitHub number within a repo (workspace-scoped) — used
 * by `StartRunUseCase` to address a PR as (repo, number) instead of its
 * internal uuid, since the MCP `run_agent_on_pr` tool only knows those.
 */
export async function getPullByNumber(
  db: Db,
  workspaceId: string,
  repoId: string,
  number: number,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(
      and(
        eq(t.pullRequests.workspaceId, workspaceId),
        eq(t.pullRequests.repoId, repoId),
        eq(t.pullRequests.number, number),
      ),
    );
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}
