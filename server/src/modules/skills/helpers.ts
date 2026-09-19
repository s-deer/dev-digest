import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from './repository.js';

/** Convert a persisted skill to the public, database-independent DTO. */
export function toSkillDto(row: SkillRow): Skill {
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
  };
}

/** Use the first Markdown H1 as an import suggestion, falling back safely. */
export function previewMarkdown(body: string): { name: string; body: string } {
  const normalized = body.replace(/^\uFEFF/, '').trim();
  const heading = normalized.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  return { name: heading || 'Imported skill', body: normalized };
}
