import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SmartDiffInputFile, SmartDiffInputFinding } from './domain.js';
import type { SmartDiffInputs, SmartDiffSourcePort } from './service.js';

/**
 * Drizzle implementation of `SmartDiffSourcePort`. Every query maps rows to
 * the domain shapes `SmartDiffService`/`buildSmartDiff` expect — no `db/schema`
 * row types cross into the service or its tests.
 */
export class SmartDiffRepository implements SmartDiffSourcePort {
  constructor(private db: Db) {}

  /**
   * PR + its files + the latest review's kept findings, in one workspace-
   * scoped call (modeled on `IntentRepository.loadInputs`) so tenancy can't
   * be bypassed by calling a files/findings query without checking the PR
   * first. `undefined` when the PR isn't in this workspace.
   */
  async loadInputs(workspaceId: string, prId: string): Promise<SmartDiffInputs | undefined> {
    const [pull] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;

    const [files, findings] = await Promise.all([
      this.getPrFiles(prId),
      this.latestReviewFindings(workspaceId, prId),
    ]);
    return { files, findings };
  }

  // `pr_files.id` is a random `uuid` (see `db/schema/pulls.ts`), not an
  // insertion-ordered key, so it can't be used to recover GitHub order — the
  // implicit row order (no ORDER BY) is left as-is, same as before this fix.
  private async getPrFiles(prId: string): Promise<SmartDiffInputFile[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /** The newest `kind='review'` review for this PR (workspace-scoped), its
   *  non-dismissed findings only (same "latest review" query style as
   *  `pulls/routes.ts`'s `latestReviewByPr`, filtered further to
   *  `dismissedAt IS NULL`). Ties on `created_at` broken by `id desc` so
   *  "latest" is deterministic. `[]` before the first review. */
  private async latestReviewFindings(workspaceId: string, prId: string): Promise<SmartDiffInputFinding[]> {
    const [latest] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.reviews.prId, prId),
          eq(t.reviews.kind, 'review'),
        ),
      )
      .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id))
      .limit(1);
    if (!latest) return [];

    const rows = await this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .where(and(eq(t.findings.reviewId, latest.id), isNull(t.findings.dismissedAt)));
    return rows.map((row) => ({ file: row.file, start_line: row.startLine }));
  }
}
