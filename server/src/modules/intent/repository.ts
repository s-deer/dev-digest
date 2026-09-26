import { and, eq, inArray, sql } from 'drizzle-orm';
import { IntentSource } from '@devdigest/shared';
import type { IntentChangeType, IntentConfidence } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentInputs, StoredIntent, UpsertIntentInput } from './domain.js';

/**
 * Intent Layer (L03) persistence: `pr_intent` (one row per PR, cached by
 * `head_sha` + `inputs_hash`) plus the inputs `IntentService` needs to derive
 * it (`pull_requests`, `pr_commits`, `pr_files`). Workspace-scoped throughout.
 * Maps every Drizzle row to a domain shape (`IntentPull` / `StoredIntent`,
 * `modules/intent/domain.ts`) before it crosses the `IntentStorePort` — the
 * service and its hermetic tests never see `db/schema` types.
 */

type PrIntentRow = typeof t.prIntent.$inferSelect;

/** `pr_intent` row → `StoredIntent`: numeric coercion, jsonb `sources` parse, ISO timestamp. */
function toStoredIntent(row: PrIntentRow): StoredIntent {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    change_type: row.changeType as IntentChangeType,
    confidence: row.confidence as IntentConfidence,
    confidence_score: row.confidenceScore,
    sources: IntentSource.array().catch([]).parse(row.sources),
    missing_docs: row.missingDocs,
    pr_id: row.prId,
    head_sha: row.headSha,
    inputs_hash: row.inputsHash,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd == null ? null : Number(row.costUsd),
    cost_usd_total: row.costUsdTotal == null ? null : Number(row.costUsdTotal),
    updated_at: row.updatedAt.toISOString(),
  };
}

export class IntentRepository {
  constructor(private db: Db) {}

  /** PR + repo + commits + changed paths, workspace-scoped. `undefined` when
   *  the PR (or its repo) isn't in this workspace. */
  async loadInputs(workspaceId: string, prId: string): Promise<IntentInputs | undefined> {
    const [pull] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, pull.repoId)));
    if (!repo) return undefined;

    const commitRows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(t.prCommits.committedAt);
    const fileRows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));

    return {
      pull: {
        id: pull.id,
        number: pull.number,
        title: pull.title,
        body: pull.body,
        branch: pull.branch,
        headSha: pull.headSha,
      },
      repo: { owner: repo.owner, name: repo.name, fullName: repo.fullName },
      commits: commitRows.map((row) => row.message),
      filePaths: fileRows.map((row) => row.path),
    };
  }

  async get(workspaceId: string, prId: string): Promise<StoredIntent | undefined> {
    const [row] = await this.db
      .select()
      .from(t.prIntent)
      .where(and(eq(t.prIntent.workspaceId, workspaceId), eq(t.prIntent.prId, prId)));
    return row ? toStoredIntent(row) : undefined;
  }

  /**
   * Upsert the derived intent (one row per PR). On conflict (regenerating an
   * existing PR's intent), `cost_usd_total` accumulates the new call's cost
   * onto the running total rather than resetting it.
   */
  async upsert(values: UpsertIntentInput): Promise<StoredIntent> {
    const [row] = await this.db
      .insert(t.prIntent)
      .values({
        prId: values.prId,
        workspaceId: values.workspaceId,
        intent: values.intent,
        inScope: values.inScope,
        outOfScope: values.outOfScope,
        headSha: values.headSha,
        inputsHash: values.inputsHash,
        changeType: values.changeType,
        confidence: values.confidence,
        confidenceScore: values.confidenceScore,
        missingDocs: values.missingDocs,
        sources: values.sources,
        provider: values.provider,
        model: values.model,
        tokensIn: values.tokensIn,
        tokensOut: values.tokensOut,
        costUsd: values.costUsd,
        costUsdTotal: values.costUsd,
      })
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: values.intent,
          inScope: values.inScope,
          outOfScope: values.outOfScope,
          headSha: values.headSha,
          inputsHash: values.inputsHash,
          changeType: values.changeType,
          confidence: values.confidence,
          confidenceScore: values.confidenceScore,
          missingDocs: values.missingDocs,
          sources: values.sources,
          provider: values.provider,
          model: values.model,
          tokensIn: values.tokensIn,
          tokensOut: values.tokensOut,
          costUsd: values.costUsd,
          // Existing (pre-update) row + this call's cost — NOT `excluded`
          // twice, since `values.costUsd` already IS the excluded value. The
          // explicit `::numeric` cast matters: without it, postgres-js binds
          // a plain JS number param as `integer` and a fractional cost (e.g.
          // 0.001) fails with "invalid input syntax for type integer".
          costUsdTotal: sql`coalesce(${t.prIntent.costUsdTotal}, 0) + coalesce(${values.costUsd}::numeric, 0)`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toStoredIntent(row!);
  }

  async updatePullBody(workspaceId: string, prId: string, body: string): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ body })
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  }

  /**
   * `pr_intent.cost_usd_total` per PR — folded into the PR list's total spend
   * alongside `doneRunCostsForPulls` (same `{prId, costUsd}` shape; see
   * `modules/pulls/cost.ts`). Scoped by `workspaceId` like every other query
   * here; the caller (`modules/pulls/routes.ts`) already passes workspace-
   * scoped PR ids, but this makes the guard explicit rather than relying on it.
   */
  async costsForPulls(workspaceId: string, prIds: string[]): Promise<{ prId: string | null; costUsd: number | null }[]> {
    if (prIds.length === 0) return [];
    const rows = await this.db
      .select({ prId: t.prIntent.prId, costUsd: t.prIntent.costUsdTotal })
      .from(t.prIntent)
      .where(and(eq(t.prIntent.workspaceId, workspaceId), inArray(t.prIntent.prId, prIds)));
    return rows.map((row) => ({
      prId: row.prId,
      costUsd: row.costUsd == null ? null : Number(row.costUsd),
    }));
  }
}
