import { and, count, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { Db, DbTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type {
  SkillCreateValues,
  SkillData,
  SkillUpdateValues,
  SkillVersionData,
  SkillWithUsage,
} from './helpers.js';

type SkillRow = typeof t.skills.$inferSelect;
type SkillVersionRow = typeof t.skillVersions.$inferSelect;
/** A skill row plus the number of agents it is attached to. */
type SkillWithUsageRow = SkillRow & { agentCount: number };

function toSkillData(row: SkillRow): SkillData {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidenceFiles: row.evidenceFiles ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSkillWithUsage(row: SkillWithUsageRow): SkillWithUsage {
  return { ...toSkillData(row), agentCount: row.agentCount };
}

function toSkillVersionData(row: SkillVersionRow): SkillVersionData {
  return {
    skillId: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/** Drizzle persistence for reusable skills. Every resource query is tenant-scoped. */
export class SkillsRepository {
  constructor(private db: Db) {}

  /** Skills with their attachment count; `agent_skills` rows count whether or not they are enabled. */
  private selectWithUsage() {
    return this.db
      .select({ ...getTableColumns(t.skills), agentCount: count(t.agentSkills.agentId) })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .groupBy(t.skills.id);
  }

  async list(workspaceId: string): Promise<SkillWithUsage[]> {
    const rows = await this.selectWithUsage()
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(desc(t.skills.createdAt));
    return rows.map(toSkillWithUsage);
  }

  async getById(workspaceId: string, id: string): Promise<SkillWithUsage | undefined> {
    const [row] = await this.selectWithUsage().where(
      and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)),
    );
    return row ? toSkillWithUsage(row) : undefined;
  }

  async insert(values: SkillCreateValues, tx?: DbTx): Promise<SkillData> {
    if (!tx) return this.db.transaction((transaction) => this.insert(values, transaction));
    const { versionNote, ...skill } = values;
    const [row] = await tx
      .insert(t.skills)
      .values({
        ...skill,
        evidenceFiles: skill.evidenceFiles ?? null,
        enabled: skill.enabled ?? true,
        version: 1,
      })
      .returning();
    await tx
      .insert(t.skillVersions)
      .values({ skillId: row!.id, version: 1, body: row!.body, note: versionNote ?? 'Initial version' });
    return toSkillData(row!);
  }

  /**
   * Patch a skill. A changed body bumps `version` and appends an immutable
   * snapshot; metadata-only edits keep the version.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: SkillUpdateValues,
    versionNote?: string,
    tx?: DbTx,
  ): Promise<SkillData | undefined> {
    if (!tx) {
      return this.db.transaction((transaction) =>
        this.update(workspaceId, id, patch, versionNote, transaction),
      );
    }
    const [existing] = await tx
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .for('update');
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const version = bodyChanged ? existing.version + 1 : existing.version;
    const [row] = await tx
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(bodyChanged ? { version } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    if (bodyChanged && row) {
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row.id, version, body: row.body, note: versionNote ?? null });
    }
    return row ? toSkillData(row) : undefined;
  }

  async findByName(
    workspaceId: string,
    name: string,
    source: SkillSource,
    tx?: DbTx,
  ): Promise<SkillData | undefined> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name), eq(t.skills.source, source)));
    return row ? toSkillData(row) : undefined;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** All body snapshots of a workspace skill, newest first; undefined when the skill is not in the workspace. */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionData[] | undefined> {
    const [skill] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    if (!skill) return undefined;
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersionData);
  }

  /** NOT workspace-scoped: `skill_versions` rows carry no workspace column. Callers
   *  must resolve the skill through `getById(workspaceId, id)` first. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionData | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row ? toSkillVersionData(row) : undefined;
  }
}
