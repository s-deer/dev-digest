import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  AgentSkillLink,
  AttachmentOwner,
  ProjectContextStorePort,
  RepoSummary,
  UsageRow,
} from './domain.js';

/**
 * Project Context persistence (`project_context_attachments`, ring 4). Every
 * query is scoped by `workspaceId`; rows are mapped to the domain shapes in
 * `domain.ts` before they cross the `ProjectContextStorePort`. A save only
 * writes this table — never `agents`, `skills` or their versions (AC-23).
 */
export class ProjectContextRepository implements ProjectContextStorePort {
  constructor(private db: Db) {}

  async repoInWorkspace(workspaceId: string, repoId: string): Promise<RepoSummary | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row
      ? { id: row.id, owner: row.owner, name: row.name, fullName: row.fullName, defaultBranch: row.defaultBranch }
      : undefined;
  }

  async agentInWorkspace(workspaceId: string, agentId: string) {
    const [row] = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row;
  }

  async skillInWorkspace(workspaceId: string, skillId: string) {
    const [row] = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row;
  }

  private ownerColumn(owner: AttachmentOwner) {
    return owner.kind === 'agent' ? t.projectContextAttachments.agentId : t.projectContextAttachments.skillId;
  }

  async listAttachments(workspaceId: string, owner: AttachmentOwner, repoId: string): Promise<string[]> {
    const a = t.projectContextAttachments;
    const rows = await this.db
      .select({ path: a.path })
      .from(a)
      .where(
        and(eq(a.workspaceId, workspaceId), eq(a.repoId, repoId), eq(a.ownerKind, owner.kind), eq(this.ownerColumn(owner), owner.id)),
      )
      .orderBy(asc(a.position));
    return rows.map((r) => r.path);
  }

  async replaceAttachments(
    workspaceId: string,
    owner: AttachmentOwner,
    repoId: string,
    paths: readonly string[],
  ): Promise<void> {
    const a = t.projectContextAttachments;
    await this.db.transaction(async (tx) => {
      await tx
        .delete(a)
        .where(
          and(eq(a.workspaceId, workspaceId), eq(a.repoId, repoId), eq(a.ownerKind, owner.kind), eq(this.ownerColumn(owner), owner.id)),
        );
      if (paths.length === 0) return;
      await tx.insert(a).values(
        paths.map((path, position) => ({
          workspaceId,
          repoId,
          ownerKind: owner.kind,
          agentId: owner.kind === 'agent' ? owner.id : null,
          skillId: owner.kind === 'skill' ? owner.id : null,
          path,
          position,
        })),
      );
    });
  }

  async listSkillAttachments(
    workspaceId: string,
    skillIds: readonly string[],
    repoId: string,
  ): Promise<Record<string, string[]>> {
    if (skillIds.length === 0) return {};
    const a = t.projectContextAttachments;
    const rows = await this.db
      .select({ skillId: a.skillId, path: a.path })
      .from(a)
      .where(
        and(
          eq(a.workspaceId, workspaceId),
          eq(a.repoId, repoId),
          eq(a.ownerKind, 'skill'),
          inArray(a.skillId, [...skillIds]),
        ),
      )
      .orderBy(asc(a.position));
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      if (r.skillId) (out[r.skillId] ??= []).push(r.path);
    }
    return out;
  }

  async usageForRepo(workspaceId: string, repoId: string): Promise<UsageRow[]> {
    const a = t.projectContextAttachments;
    const direct = await this.db
      .select({ path: a.path, agentId: t.agents.id, agentName: t.agents.name })
      .from(a)
      .innerJoin(t.agents, eq(a.agentId, t.agents.id))
      .where(and(eq(a.workspaceId, workspaceId), eq(a.repoId, repoId), eq(a.ownerKind, 'agent'), eq(t.agents.workspaceId, workspaceId)));
    const viaSkill = await this.db
      .select({ path: a.path, agentId: t.agents.id, agentName: t.agents.name, skillName: t.skills.name })
      .from(a)
      .innerJoin(t.skills, eq(a.skillId, t.skills.id))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(a.workspaceId, workspaceId),
          eq(a.repoId, repoId),
          eq(a.ownerKind, 'skill'),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agents.workspaceId, workspaceId),
        ),
      );
    return [
      ...direct.map((r) => ({ path: r.path, agentId: r.agentId, agentName: r.agentName, via: 'direct' as const, skillName: null })),
      ...viaSkill.map((r) => ({ path: r.path, agentId: r.agentId, agentName: r.agentName, via: 'skill' as const, skillName: r.skillName })),
    ];
  }

  async agentSkillLinks(workspaceId: string, agentId: string): Promise<AgentSkillLink[]> {
    const rows = await this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        linkEnabled: t.agentSkills.enabled,
        skillEnabled: t.skills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agents.workspaceId, workspaceId), eq(t.skills.workspaceId, workspaceId)))
      .orderBy(asc(t.agentSkills.order));
    return rows;
  }
}
