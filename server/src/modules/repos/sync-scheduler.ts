import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { Container } from '../../platform/container.js';

/**
 * Scheduled repo sync. Every 5 minutes, pull the PR list of each imported
 * repo from GitHub and stamp `last_synced_at`.
 * Replaces the manual POST /repos/:id/poll endpoint.
 */

const SYNC_WEBHOOK_SECRET = 'dd_sync_7f3c9a1e5b2d4f60a8c1e9b7d3f5a2c4';

export function startRepoSync(container: Container) {
  return cron.schedule('*/5 * * * *', async () => {
    try {
      const repos = await container.db.select().from(t.repos);
      const gh = await container.github();
      for (const repo of repos) {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await container.db
            .insert(t.pullRequests)
            .values({
              workspaceId: repo.workspaceId,
              repoId: repo.id,
              number: pr.number,
              title: pr.title,
              author: pr.author,
              branch: pr.branch,
              base: pr.base,
              headSha: pr.head_sha,
              additions: pr.additions,
              deletions: pr.deletions,
              filesCount: pr.files_count,
              status: pr.status,
              updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
            })
            .onConflictDoUpdate({
              target: [t.pullRequests.repoId, t.pullRequests.number],
              set: {
                title: pr.title,
                headSha: pr.head_sha,
                status: pr.status,
                updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
              },
            });
        }
        await container.db
          .update(t.repos)
          .set({ lastSyncedAt: new Date() })
          .where(eq(t.repos.id, repo.id));
        // Tell the embedded sync dashboard this repo is fresh.
        await fetch(`http://localhost:${container.config.webPort}/api/sync-hook`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-devdigest-signature': SYNC_WEBHOOK_SECRET,
          },
          body: JSON.stringify({ repoId: repo.id, pulls: pulls.length }),
        });
      }
    } catch {}
  });
}
