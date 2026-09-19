import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus, Provider, SkillType } from '@devdigest/shared';
import type { VerifiedCandidate } from './helpers.js';
import type { AgentsRepository } from '../agents/repository.js';
import type { SkillsRepository } from '../skills/repository.js';

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;

export interface CreateOrUpdateSkillAndAttachInput {
  workspaceId: string;
  agentId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  evidenceFiles: string[];
  conventionCount: number;
}

export interface ConventionSkillWriter {
  createOrUpdateSkillAndAttach(input: CreateOrUpdateSkillAndAttachInput): Promise<string>;
}

/** Coordinates the extracted-skill writes that must commit together. */
export class ConventionsUnitOfWork implements ConventionSkillWriter {
  constructor(
    private db: Db,
    private skills: SkillsRepository,
    private agents: AgentsRepository,
  ) {}

  async createOrUpdateSkillAndAttach(input: CreateOrUpdateSkillAndAttachInput): Promise<string> {
    return this.db.transaction(async (tx) => {
      const existing = await this.skills.findByName(input.workspaceId, input.name, 'extracted', tx);
      let skillId: string;
      if (existing) {
        const updated = await this.skills.update(
          input.workspaceId,
          existing.id,
          {
            name: input.name,
            description: input.description,
            type: input.type,
            body: input.body,
            enabled: input.enabled,
            evidenceFiles: input.evidenceFiles,
          },
          `Re-extracted from ${input.conventionCount} conventions`,
          tx,
        );
        skillId = updated?.id ?? existing.id;
      } else {
        const inserted = await this.skills.insert(
          {
            workspaceId: input.workspaceId,
            name: input.name,
            description: input.description,
            type: input.type,
            source: 'extracted',
            body: input.body,
            enabled: input.enabled,
            evidenceFiles: input.evidenceFiles,
            versionNote: `Extracted from ${input.conventionCount} conventions`,
          },
          tx,
        );
        skillId = inserted.id;
      }
      await this.agents.appendSkillLink(input.agentId, skillId, tx);
      return skillId;
    });
  }
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string, repoId: string, statuses: ConventionStatus[]): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId), inArray(t.conventions.status, statuses)))
      .orderBy(desc(t.conventions.confidence), asc(t.conventions.createdAt));
  }

  async counts(workspaceId: string, repoId: string): Promise<Record<ConventionStatus, number>> {
    const rows = await this.db
      .select({ status: t.conventions.status, count: sql<number>`count(*)::int` })
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .groupBy(t.conventions.status);
    return {
      pending: rows.find((row) => row.status === 'pending')?.count ?? 0,
      accepted: rows.find((row) => row.status === 'accepted')?.count ?? 0,
      rejected: rows.find((row) => row.status === 'rejected')?.count ?? 0,
    };
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async decidedRules(workspaceId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, ['accepted', 'rejected']),
        ),
      );
    return rows.map((row) => row.rule);
  }

  async getAcceptedByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
          inArray(t.conventions.id, ids),
        ),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter((row): row is ConventionRow => !!row);
  }

  async runningScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(
          eq(t.conventionScans.workspaceId, workspaceId),
          eq(t.conventionScans.repoId, repoId),
          eq(t.conventionScans.status, 'running'),
        ),
      )
      .limit(1);
    return row;
  }

  async insertScan(values: {
    workspaceId: string;
    repoId: string;
    provider: Provider;
    model: string;
    sampledFiles: string[];
  }): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ ...values, status: 'running' })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async finishScan(
    id: string,
    patch: Partial<Pick<ConventionScanRow, 'status' | 'sampledFiles' | 'proposed' | 'kept' | 'droppedUngrounded' | 'droppedDuplicate' | 'tokensIn' | 'tokensOut' | 'costUsd' | 'error'>>,
  ): Promise<ConventionScanRow> {
    const [row] = await this.db
      .update(t.conventionScans)
      .set({ ...patch, finishedAt: patch.status && patch.status !== 'running' ? new Date() : undefined })
      .where(eq(t.conventionScans.id, id))
      .returning();
    return row!;
  }

  async lastScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row;
  }

  async replacePending(
    workspaceId: string,
    repoId: string,
    scanId: string,
    candidates: VerifiedCandidate[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (candidates.length === 0) return;
      await tx.insert(t.conventions).values(
        candidates.map((candidate) => ({
          workspaceId,
          repoId,
          scanId,
          category: candidate.category,
          rule: candidate.rule,
          rationale: candidate.rationale,
          evidencePath: candidate.evidencePath,
          evidenceLine: candidate.evidenceLine,
          evidenceSnippet: candidate.evidenceSnippet,
          confidence: candidate.confidence,
          status: 'pending' as const,
        })),
      );
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string; rationale?: string | null; category?: ConventionCategory },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async reapStaleScans(): Promise<number> {
    const rows = await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error: 'Server restarted during scan', finishedAt: new Date() })
      .where(eq(t.conventionScans.status, 'running'))
      .returning({ id: t.conventionScans.id });
    return rows.length;
  }
}
