import { and, count, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillType } from '@devdigest/shared';

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;
/** A skill row plus the number of agents it is attached to. */
export type SkillWithUsageRow = SkillRow & { agentCount: number };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: (typeof t.skills.$inferInsert)['source'];
  body: string;
  enabled?: boolean;
  /** Note stored on the initial v1 snapshot. */
  versionNote?: string;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
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

  async list(workspaceId: string): Promise<SkillWithUsageRow[]> {
    return this.selectWithUsage()
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(desc(t.skills.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<SkillWithUsageRow | undefined> {
    const [row] = await this.selectWithUsage().where(
      and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)),
    );
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    const { versionNote, ...skill } = values;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...skill, enabled: skill.enabled ?? true, version: 1 })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: 1, body: row!.body, note: versionNote ?? 'Initial version' });
      return row!;
    });
  }

  /**
   * Patch a skill. A changed body bumps `version` and appends an immutable
   * snapshot; metadata-only edits keep the version.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    versionNote?: string,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
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
      return row;
    });
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** All body snapshots of a workspace skill, newest first; undefined when the skill is not in the workspace. */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionRow[] | undefined> {
    const [skill] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    if (!skill) return undefined;
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** NOT workspace-scoped: `skill_versions` rows carry no workspace column. Callers
   *  must resolve the skill through `getById(workspaceId, id)` first. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }
}
