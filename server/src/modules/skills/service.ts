import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import { toSkillDto, previewMarkdown } from './helpers.js';
import { SkillsRepository } from './repository.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** Application service for skill lifecycle and Markdown preview. */
export class SkillsService {
  constructor(private repo: SkillsRepository) {}

  async list(workspaceId: string): Promise<Skill[]> {
    return (await this.repo.list(workspaceId)).map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    return toSkillDto(
      await this.repo.insert({
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source: input.source,
        body: input.body,
        enabled: input.enabled,
      }),
    );
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  previewImport(markdown: string) {
    return previewMarkdown(markdown);
  }
}
