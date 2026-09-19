import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
  CreateConventionSkillBody,
  ConventionsState,
  LLMProvider,
  Provider,
  Skill,
} from '@devdigest/shared';
import type { GitClient, RepoRef } from '@devdigest/shared';
import { NotFoundError, ValidationError, ConflictError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  buildSkillDraft,
  dedupe,
  renderSample,
  toCandidateDto,
  toScanDto,
  toSampledFile,
  verifyCandidate,
  type RawCandidate,
  type SampledFile,
  type VerifiedCandidate,
} from './helpers.js';
import { ExtractionSchema, SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import {
  CONFIG_SAMPLE_PATHS,
  EXTRACT_MAX_TOKENS,
  EXTRACT_TEMPERATURE,
  EXTRACT_TIMEOUT_MS,
  MAX_CANDIDATES,
  SOURCE_SAMPLE_SIZE,
} from './constants.js';
import { toSkillDto, type SkillWithUsage } from '../skills/helpers.js';

type ConventionRecord = Parameters<typeof toCandidateDto>[0];
type ConventionScanRecord = Parameters<typeof toScanDto>[0];
type SkillRecord = Parameters<typeof toSkillDto>[0];

interface ConventionsPort {
  list(workspaceId: string, repoId: string, statuses: ConventionStatus[]): Promise<ConventionRecord[]>;
  counts(workspaceId: string, repoId: string): Promise<Record<ConventionStatus, number>>;
  lastScan(workspaceId: string, repoId: string): Promise<ConventionScanRecord | undefined>;
  update(workspaceId: string, id: string, patch: {
    status?: ConventionStatus;
    rule?: string;
    rationale?: string | null;
    category?: ConventionCategory;
  }): Promise<ConventionRecord | undefined>;
  runningScan(workspaceId: string, repoId: string): Promise<ConventionScanRecord | undefined>;
  insertScan(values: {
    workspaceId: string;
    repoId: string;
    provider: Provider;
    model: string;
    sampledFiles: string[];
  }): Promise<ConventionScanRecord | undefined>;
  finishScan(id: string, patch: Partial<Pick<ConventionScanRecord,
    | 'status'
    | 'sampledFiles'
    | 'proposed'
    | 'kept'
    | 'droppedUngrounded'
    | 'droppedDuplicate'
    | 'tokensIn'
    | 'tokensOut'
    | 'costUsd'
    | 'error'
  >>): Promise<ConventionScanRecord>;
  decidedRules(workspaceId: string, repoId: string): Promise<string[]>;
  replacePending(workspaceId: string, repoId: string, scanId: string, candidates: VerifiedCandidate[]): Promise<void>;
  getAcceptedByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRecord[]>;
}

interface SkillWriterPort {
  createOrUpdateSkillAndAttach(input: {
    workspaceId: string;
    agentId: string;
    name: string;
    description: string;
    type: CreateConventionSkillBody['type'];
    body: string;
    enabled: boolean;
    evidenceFiles: string[];
    conventionCount: number;
  }): Promise<string>;
}

interface RepoPort {
  getById(workspaceId: string, id: string): Promise<{
    owner: string;
    name: string;
    fullName: string;
    clonePath: string | null;
  } | undefined>;
}

interface SkillsPort {
  findByName(
    workspaceId: string,
    name: string,
    source: 'extracted',
  ): Promise<Pick<SkillRecord, 'id' | 'version'> | undefined>;
  getById(workspaceId: string, id: string): Promise<SkillWithUsage | undefined>;
}

interface AgentsPort {
  getById(workspaceId: string, id: string): Promise<{ id: string } | undefined>;
}

export interface ConventionsServiceDeps {
  conventions: ConventionsPort;
  skillWriter: SkillWriterPort;
  repos: RepoPort;
  skills: SkillsPort;
  agents: AgentsPort;
  repoIntel: { getConventionSamples(repoId: string, n: number): Promise<string[]> };
  git: GitClient;
  resolveModel(workspaceId: string): Promise<{ provider: Provider; model: string }>;
  llm(provider: Provider): Promise<LLMProvider>;
}

export class ConventionsService {
  constructor(private deps: ConventionsServiceDeps) {}

  async list(workspaceId: string, repoId: string, statuses: ConventionStatus[]): Promise<ConventionsState> {
    await this.requireRepo(workspaceId, repoId);
    const [rows, counts, scan] = await Promise.all([
      this.deps.conventions.list(workspaceId, repoId, statuses),
      this.deps.conventions.counts(workspaceId, repoId),
      this.deps.conventions.lastScan(workspaceId, repoId),
    ]);
    return {
      last_scan: scan ? toScanDto(scan) : null,
      candidates: rows.map(toCandidateDto),
      counts,
    };
  }

  async update(workspaceId: string, id: string, patch: {
    status?: ConventionStatus;
    rule?: string;
    rationale?: string | null;
    category?: ConventionCategory;
  }): Promise<ConventionCandidate | undefined> {
    const row = await this.deps.conventions.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('Clone the repository before scanning conventions');
    if (await this.deps.conventions.runningScan(workspaceId, repoId)) {
      throw new ConflictError('Scan already running');
    }

    const model = await this.deps.resolveModel(workspaceId);
    const scan = await this.deps.conventions.insertScan({
      workspaceId,
      repoId,
      provider: model.provider,
      model: model.model,
      sampledFiles: [],
    });
    if (!scan) throw new ConflictError('Scan already running');

    try {
      const sample = await this.sample(repoId, { owner: repo.owner, name: repo.name });
      if (sample.sourceCount === 0) {
        await this.deps.conventions.finishScan(scan.id, {
          status: 'failed',
          error: 'Clone and index the repo first',
          sampledFiles: sample.files.map((file) => file.path),
        });
        throw new ValidationError('Clone and index the repo first');
      }
      const rendered = renderSample(sample.files);
      const llm = await this.deps.llm(model.provider);
      const result = await llm.completeStructured({
        model: model.model,
        schema: ExtractionSchema,
        schemaName: 'ConventionExtraction',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(repo.fullName, rendered.text, rendered.included) },
        ],
        temperature: EXTRACT_TEMPERATURE,
        maxTokens: EXTRACT_MAX_TOKENS,
        timeoutMs: EXTRACT_TIMEOUT_MS,
      });
      const proposed = result.data.candidates.slice(0, MAX_CANDIDATES);
      const files = new Map(sample.files.map((file) => [file.path, file]));
      const verified = [];
      let droppedUngrounded = 0;
      for (const candidate of proposed) {
        const checked = verifyCandidate(files, candidate as RawCandidate);
        if (checked.ok) verified.push(checked.candidate);
        else droppedUngrounded += 1;
      }
      verified.sort((a, b) => b.confidence - a.confidence);
      const decided = await this.deps.conventions.decidedRules(workspaceId, repoId);
      const unique = dedupe(verified, decided);
      await this.deps.conventions.replacePending(workspaceId, repoId, scan.id, unique.kept);
      const completed = await this.deps.conventions.finishScan(scan.id, {
        status: 'done',
        sampledFiles: rendered.included,
        proposed: proposed.length,
        kept: unique.kept.length,
        droppedUngrounded,
        droppedDuplicate: unique.dropped,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      });
      return { scan: toScanDto(completed), state: await this.list(workspaceId, repoId, ['pending', 'accepted']) };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      await this.deps.conventions.finishScan(scan.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Convention scan failed',
      });
      throw error;
    }
  }

  async draft(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const selected = ids.length
      ? await this.deps.conventions.getAcceptedByIds(workspaceId, repoId, ids)
      : await this.deps.conventions.list(workspaceId, repoId, ['accepted']);
    if (selected.length !== ids.length && ids.length > 0) {
      throw new ValidationError('Every convention must be accepted before creating a skill');
    }
    if (selected.length === 0) throw new ValidationError('Accept at least one convention before creating a skill');
    const existing = await this.deps.skills.findByName(workspaceId, 'repo-conventions', 'extracted');
    return buildSkillDraft(
      repo.fullName,
      selected,
      existing ? { id: existing.id, version: existing.version } : null,
    );
  }

  async createSkill(workspaceId: string, repoId: string, body: CreateConventionSkillBody): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);
    const selected = await this.deps.conventions.getAcceptedByIds(workspaceId, repoId, body.convention_ids);
    if (selected.length !== body.convention_ids.length || selected.length === 0) {
      throw new ValidationError('Only accepted conventions from this repository can become a skill');
    }
    const agent = await this.deps.agents.getById(workspaceId, body.agent_id);
    if (!agent) throw new NotFoundError('Agent not found');

    const skillId = await this.deps.skillWriter.createOrUpdateSkillAndAttach({
      workspaceId,
      agentId: agent.id,
      name: body.name,
      description: body.description,
      type: body.type,
      body: body.body,
      enabled: body.enabled,
      evidenceFiles: body.evidence_files,
      conventionCount: selected.length,
    });
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Created skill not found');
    return toSkillDto(skill, skill.agentCount);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async sample(repoId: string, ref: RepoRef): Promise<{ files: SampledFile[]; sourceCount: number }> {
    const sourcePaths = await this.deps.repoIntel.getConventionSamples(repoId, SOURCE_SAMPLE_SIZE);
    const paths = [...CONFIG_SAMPLE_PATHS.map((path) => ({ path, kind: 'config' as const })), ...sourcePaths.map((path) => ({ path, kind: 'source' as const }))];
    const files: SampledFile[] = [];
    const seen = new Set<string>();
    for (const { path, kind } of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      let content = '';
      try {
        content = await this.deps.git.readFile(ref, path);
      } catch {
        continue;
      }
      if (!content.trim()) continue;
      files.push(toSampledFile(path, content, kind));
    }
    return { files, sourceCount: files.filter((file) => file.kind === 'source').length };
  }
}
