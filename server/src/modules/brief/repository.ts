import { and, desc, eq } from 'drizzle-orm';
import { PrBriefRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import type { BriefPullData } from './domain.js';
import type { BriefStorePort } from './service.js';

/**
 * Drizzle implementation of `BriefStorePort`: the stored brief (`pr_brief`,
 * one jsonb row per PR, last write wins) plus the PR facts the brief reads
 * (`pull_requests`, `repos`, `pr_files`, and the most recent review agent with
 * its enabled skills). Workspace-scoped throughout; rows are mapped to domain
 * shapes before they cross the port.
 */
export class BriefRepository implements BriefStorePort {
  constructor(private db: Db) {}

  /** PR + repo + changed files (with patches, for hunk ranges). `undefined` when not in this workspace. */
  async loadPull(workspaceId: string, prId: string): Promise<BriefPullData | undefined> {
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
    const files = await this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(t.prFiles.path);
    return {
      pull: { id: pull.id, number: pull.number, title: pull.title, body: pull.body, headSha: pull.headSha },
      repo: { id: repo.id, owner: repo.owner, name: repo.name },
      files,
    };
  }

  /** The stored brief, or `undefined` when none exists or the row no longer parses. */
  async getStored(workspaceId: string, prId: string): Promise<PrBriefRecord | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    if (!row) return undefined;
    const parsed = PrBriefRecord.safeParse(row.json);
    return parsed.success ? parsed.data : undefined;
  }

  /** Upsert the PR's brief (one row per PR). */
  async save(workspaceId: string, prId: string, record: PrBriefRecord): Promise<void> {
    const [pull] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) throw new NotFoundError('Pull request not found');
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: record })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: record } });
  }

  /**
   * The agent of the most recently started run on any PR of this repo (any
   * status). `agent_runs.agent_id` is `set null` on agent delete, so the inner
   * join on `agents` skips runs whose agent no longer exists.
   */
  async latestRunAgent(workspaceId: string, repoId: string): Promise<{ id: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .innerJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.agents.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(1);
    return row;
  }

  /** Skills attached to the agent that passed BOTH enable gates, in prompt order. */
  async enabledSkills(workspaceId: string, agentId: string): Promise<{ skillId: string; name: string }[]> {
    return this.db
      .select({ skillId: t.skills.id, name: t.skills.name })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(t.agentSkills.order);
  }
}
