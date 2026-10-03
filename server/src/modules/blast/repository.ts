import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastScope, BlastSourcePort } from './service.js';

/**
 * Drizzle implementation of `BlastSourcePort`. Resolves the PR's repo id and
 * changed file paths (`pr_files.path`) in one workspace-scoped call (modeled
 * on `SmartDiffRepository.loadInputs`) so tenancy can't be bypassed by
 * reading `pr_files` without first checking the PR belongs to this
 * workspace. `undefined` when the PR isn't in this workspace.
 */
export class BlastRepository implements BlastSourcePort {
  constructor(private db: Db) {}

  async loadScope(workspaceId: string, prId: string): Promise<BlastScope | undefined> {
    const [pull] = await this.db
      .select({ repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;

    const files = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));

    return { repoId: pull.repoId, changedFiles: files.map((f) => f.path) };
  }
}
