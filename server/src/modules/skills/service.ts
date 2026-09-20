import type { Skill, SkillImportPreview, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import {
  toSkillDto,
  toSkillVersionDto,
  type SkillCreateValues,
  type SkillData,
  type SkillUpdateValues,
  type SkillVersionData,
  type SkillWithUsage,
} from './helpers.js';
import { parseSkillUpload } from './importer.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  version_note?: string;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export type RestoreResult = { status: 'not_found' } | { status: 'ok'; skill: Skill };

/** Persistence port for `SkillsService` — implemented by `SkillsRepository`. */
export interface SkillsRepo {
  list(workspaceId: string): Promise<SkillWithUsage[]>;
  getById(workspaceId: string, id: string): Promise<SkillWithUsage | undefined>;
  insert(values: SkillCreateValues): Promise<SkillData>;
  update(
    workspaceId: string,
    id: string,
    patch: SkillUpdateValues,
    versionNote?: string,
  ): Promise<SkillData | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  listVersions(workspaceId: string, skillId: string): Promise<SkillVersionData[] | undefined>;
  getVersion(skillId: string, version: number): Promise<SkillVersionData | undefined>;
}

/** Application service for skill lifecycle, version history, and import preview. */
export class SkillsService {
  constructor(private repo: SkillsRepo) {}

  async list(workspaceId: string): Promise<Skill[]> {
    return (await this.repo.list(workspaceId)).map((row) => toSkillDto(row, row.agentCount));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row, row.agentCount) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source,
      body: input.body,
      enabled: input.enabled,
      versionNote: input.version_note,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? this.get(workspaceId, id) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const rows = await this.repo.listVersions(workspaceId, id);
    return rows?.map(toSkillVersionDto);
  }

  /**
   * Make an old snapshot current again. History is append-only: the restored
   * body becomes a new version rather than rewinding the counter.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<RestoreResult> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return { status: 'not_found' };
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) return { status: 'not_found' };
    await this.repo.update(workspaceId, id, { body: snapshot.body }, `Restored from v${version}`);
    return { status: 'ok', skill: (await this.get(workspaceId, id))! };
  }

  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    return parseSkillUpload(filename, Buffer.from(contentBase64, 'base64'));
  }
}
