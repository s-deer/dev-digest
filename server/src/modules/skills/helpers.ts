import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';

export interface SkillData {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillWithUsage extends SkillData {
  agentCount: number;
}

export interface SkillVersionData {
  skillId: string;
  version: number;
  body: string;
  note: string | null;
  createdAt: Date;
}

export interface SkillCreateValues {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
  versionNote?: string;
}

export interface SkillUpdateValues {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

/** Convert a persisted skill to the public, database-independent DTO. */
export function toSkillDto(row: SkillData, agentCount = 0): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agent_count: agentCount,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toSkillVersionDto(row: SkillVersionData): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note,
    created_at: row.createdAt.toISOString(),
  };
}
