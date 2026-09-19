import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillType } from '@devdigest/shared';

export type SkillRow = typeof t.skills.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: (typeof t.skills.$inferInsert)['source'];
  body: string;
  enabled?: boolean;
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

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(desc(t.skills.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...values, enabled: values.enabled ?? true, version: 1 })
        .returning();
      await tx.insert(t.skillVersions).values({ skillId: row!.id, version: 1, body: row!.body });
      return row!;
    });
  }

  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const version = bodyChanged ? existing.version + 1 : existing.version;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { version } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (bodyChanged && row) {
        await tx.insert(t.skillVersions).values({ skillId: row.id, version, body: row.body });
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
}
