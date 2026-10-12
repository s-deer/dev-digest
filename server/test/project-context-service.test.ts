import { describe, expect, it } from 'vitest';
import type { TreeEntry } from '@devdigest/shared';
import { renderProjectDocBlock } from '@devdigest/reviewer-core';
import { MockGitClient } from '../src/adapters/mocks.js';
import { approxTokens } from '../src/adapters/tokenizer/index.js';
import { AppError, NotFoundError, ValidationError } from '../src/platform/errors.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type {
  AgentSkillLink,
  AttachmentOwner,
  ProjectContextStorePort,
  RepoSummary,
  UsageRow,
} from '../src/modules/project-context/domain.js';
import { MAX_READ_BYTES } from '../src/modules/project-context/constants.js';

/**
 * Hermetic ProjectContextService tests: an in-memory `ProjectContextStorePort`
 * fake, `MockGitClient` with `tree` + `filesAt` fixtures, and a char/4 tokenizer.
 */

const WS = 'ws-1';
const REPO: RepoSummary = { id: 'repo-1', owner: 'acme', name: 'api', fullName: 'acme/api', defaultBranch: 'main' };
const SHA = 'a1b2c3d4'; // MockGitClient.currentHead() default

const tokenizer = { count: approxTokens };

function blob(path: string, content: string, mode = '100644'): { entry: TreeEntry; at: [string, string] } {
  return {
    entry: { path, mode, size: Buffer.byteLength(content), sha: 'f'.repeat(40) },
    at: [`${SHA}:${path}`, content],
  };
}

class FakeStore implements ProjectContextStorePort {
  attachments = new Map<string, string[]>(); // `${kind}:${id}:${repoId}` -> paths
  usage: UsageRow[] = [];
  links: AgentSkillLink[] = [];
  replaceCalls = 0;

  async repoInWorkspace(ws: string, id: string) {
    return ws === WS && id === REPO.id ? REPO : undefined;
  }
  async agentInWorkspace(ws: string, id: string) {
    return ws === WS && id === 'agent-1' ? { id, name: 'Agent One' } : undefined;
  }
  async skillInWorkspace(ws: string, id: string) {
    return ws === WS && id.startsWith('skill-') ? { id, name: `Name ${id}` } : undefined;
  }
  private key(o: AttachmentOwner, repoId: string) {
    return `${o.kind}:${o.id}:${repoId}`;
  }
  async listAttachments(_ws: string, o: AttachmentOwner, repoId: string) {
    return this.attachments.get(this.key(o, repoId)) ?? [];
  }
  async replaceAttachments(_ws: string, o: AttachmentOwner, repoId: string, paths: readonly string[]) {
    this.replaceCalls++;
    this.attachments.set(this.key(o, repoId), [...paths]);
  }
  async listSkillAttachments(_ws: string, skillIds: readonly string[], repoId: string) {
    const out: Record<string, string[]> = {};
    for (const id of skillIds) {
      const p = this.attachments.get(this.key({ kind: 'skill', id }, repoId));
      if (p) out[id] = p;
    }
    return out;
  }
  async usageForRepo() {
    return this.usage;
  }
  async agentSkillLinks() {
    return this.links;
  }
}

function setup(
  files: { entry: TreeEntry; at: [string, string] }[],
  opts: { patterns?: string[]; limits?: { docCapTokens?: number; runBudgetTokens?: number }; git?: MockGitClient } = {},
) {
  const store = new FakeStore();
  const git =
    opts.git ??
    new MockGitClient({
      tree: files.map((f) => f.entry),
      filesAt: Object.fromEntries(files.map((f) => f.at)),
    });
  const service = new ProjectContextService({
    store,
    git,
    tokenizer,
    patterns: opts.patterns ?? ['**/{specs,docs,insights}/**/*.md'],
    limits: opts.limits,
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });
  return { store, git, service };
}

const A = blob('docs/a.md', '# A\n\nalpha');
const B = blob('.devdigest/specs/b.md', '# B\n\nbeta beta');
const LINK = blob('docs/link.md', '../../secrets', '120000');
const SUB = blob('docs/sub.md', '', '160000');
const README = blob('README.md', '# readme');
const NOTE = blob('notes/design.md', '# design');

describe('ProjectContextService.list', () => {
  it('lists matching regular files only, with type, size and token parity (AC-1..AC-5, AC-8, AC-44)', async () => {
    const { service } = setup([A, B, LINK, SUB, README, NOTE]);
    const listing = await service.list(WS, REPO.id);

    expect(listing.documents.map((d) => [d.path, d.type])).toEqual([
      ['.devdigest/specs/b.md', 'specs'],
      ['docs/a.md', 'docs'],
    ]);
    const a = listing.documents.find((d) => d.path === 'docs/a.md')!;
    expect(a.tokens).toBe(tokenizer.count(renderProjectDocBlock({ path: 'docs/a.md', content: '# A\n\nalpha' })));
    expect(a.size).toBe(A.entry.size);
    expect(a.over_cap).toBe(false);
    expect(listing.total_files).toBe(2);
    expect(listing.total_tokens).toBe(listing.documents.reduce((s, d) => s + d.tokens, 0));
    expect(listing.refreshed_at).toBe('2026-10-10T12:00:00.000Z');
    expect(listing.patterns).toEqual(['**/{specs,docs,insights}/**/*.md']);
    expect(listing.limits).toMatchObject({ doc_cap_tokens: 3000, run_budget_tokens: 7500, max_attachments: 50 });
  });

  it('applies changed patterns on the next call and types unmatched folders as "other" (AC-4)', async () => {
    const { service } = setup([A, NOTE], { patterns: ['notes/*.md'] });
    const listing = await service.list(WS, REPO.id);
    expect(listing.documents.map((d) => [d.path, d.type])).toEqual([['notes/design.md', 'other']]);
  });

  it('excludes unsafe paths even when they match the pattern', async () => {
    const bad = blob('docs/a"b.md', 'x');
    const { service } = setup([A, bad]);
    expect((await service.list(WS, REPO.id)).documents.map((d) => d.path)).toEqual(['docs/a.md']);
  });

  it('does not read blobs above the read limit; approximates tokens and flags over_cap', async () => {
    const big: TreeEntry = { path: 'docs/big.md', mode: '100644', size: MAX_READ_BYTES + 4, sha: 'e'.repeat(40) };
    // No filesAt fixture for the big doc: a read would throw.
    const { service } = setup([A], {
      git: new MockGitClient({ tree: [A.entry, big], filesAt: Object.fromEntries([A.at]) }),
    });
    const doc = (await service.list(WS, REPO.id)).documents.find((d) => d.path === 'docs/big.md')!;
    expect(doc.tokens).toBe(Math.ceil((MAX_READ_BYTES + 4) / 4));
    expect(doc.over_cap).toBe(true);
  });

  it('counts distinct agents in used_by_agents, direct or via skill', async () => {
    const { service, store } = setup([A]);
    store.usage = [
      { path: 'docs/a.md', agentId: 'ag1', agentName: 'One', via: 'direct', skillName: null },
      { path: 'docs/a.md', agentId: 'ag1', agentName: 'One', via: 'skill', skillName: 'S' },
      { path: 'docs/a.md', agentId: 'ag2', agentName: 'Two', via: 'skill', skillName: 'S' },
    ];
    expect((await service.list(WS, REPO.id)).documents[0]!.used_by_agents).toBe(2);
  });

  it('a git failure is the distinct repo_unavailable error, never a stale list (AC-11)', async () => {
    const git = new MockGitClient();
    git.listTree = async () => {
      throw new Error('boom: /secret/path');
    };
    const { service } = setup([], { git });
    await expect(service.list(WS, REPO.id)).rejects.toMatchObject({
      code: 'project_context_repo_unavailable',
      statusCode: 503,
    });
  });

  it('unknown or cross-workspace repo is not found (AC-48)', async () => {
    const { service } = setup([A]);
    await expect(service.list('other-ws', REPO.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.list(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists 500 documents quickly (coarse NFR-5 guard)', async () => {
    const many = Array.from({ length: 500 }, (_, i) => blob(`docs/d${i}.md`, `# doc ${i}\n`.repeat(20)));
    const { service } = setup(many);
    const t0 = Date.now();
    const listing = await service.list(WS, REPO.id);
    expect(listing.total_files).toBe(500);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('ProjectContextService.read', () => {
  it('returns the full content, tokens and the used_by list (AC-6, AC-53)', async () => {
    const { service, store } = setup([A]);
    store.usage = [
      { path: 'docs/a.md', agentId: 'ag2', agentName: 'Zed', via: 'skill', skillName: 'Style' },
      { path: 'docs/a.md', agentId: 'ag1', agentName: 'Alpha', via: 'direct', skillName: null },
    ];
    const doc = await service.read(WS, REPO.id, 'docs/a.md');
    expect(doc.content).toBe('# A\n\nalpha');
    expect(doc.tokens).toBe(tokenizer.count(renderProjectDocBlock({ path: 'docs/a.md', content: '# A\n\nalpha' })));
    expect(doc.used_by).toEqual([
      { agent_id: 'ag1', agent_name: 'Alpha', via: 'direct', skill_name: null },
      { agent_id: 'ag2', agent_name: 'Zed', via: 'skill', skill_name: 'Style' },
    ]);
  });

  it('a path not in the listing is not found (traversal, symlink, unmatched, absent)', async () => {
    const { service } = setup([A, LINK, README]);
    for (const p of ['../etc/passwd.md', 'docs/link.md', 'README.md', 'docs/none.md']) {
      await expect(service.read(WS, REPO.id, p)).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});

describe('ProjectContextService attachments', () => {
  it('rejects the whole save when any path is outside the listing and stores nothing (AC-26)', async () => {
    const { service, store } = setup([A, B, LINK, README]);
    for (const bad of ['docs/link.md', 'README.md', '../x.md', 'docs/none.md', '/abs/docs/a.md']) {
      await expect(service.setAgentAttachments(WS, 'agent-1', REPO.id, ['docs/a.md', bad])).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    expect(store.replaceCalls).toBe(0);
    await expect(service.setAgentAttachments(WS, 'agent-1', REPO.id, ['docs/a.md', 'docs/a.md'])).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('saves the ordered set and returns the saved state with tokens and totals (AC-16, AC-17, AC-18)', async () => {
    const { service, store } = setup([A, B]);
    const view = await service.setAgentAttachments(WS, 'agent-1', REPO.id, ['docs/a.md', '.devdigest/specs/b.md']);
    expect(store.attachments.get(`agent:agent-1:${REPO.id}`)).toEqual(['docs/a.md', '.devdigest/specs/b.md']);
    expect(view.items.map((i) => i.path)).toEqual(['docs/a.md', '.devdigest/specs/b.md']);
    expect(view.items.every((i) => !i.missing && !i.over_cap && i.tokens > 0)).toBe(true);
    expect(view.total_tokens).toBe(view.items[0]!.tokens + view.items[1]!.tokens);
    expect(view.totals).toEqual({ context_tokens: view.total_tokens, specs_tokens: 0, total: view.total_tokens });
    expect(view.inherited).toEqual([]);
    expect(view.would_skip).toEqual([]);
  });

  it('marks a vanished doc missing, excludes it from totals, and keeps it detachable (AC-21, EC-1)', async () => {
    const { service, store } = setup([A]);
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/gone.md', 'docs/a.md']);
    const view = await service.getAgentAttachments(WS, 'agent-1', REPO.id);
    expect(view.items[0]).toEqual({ path: 'docs/gone.md', tokens: 0, missing: true, over_cap: false });
    expect(view.total_tokens).toBe(view.items[1]!.tokens);
    expect(view.totals.total).toBe(view.items[1]!.tokens);
  });

  it('inherits only from skills enabled both globally and for the agent, deduped (AC-19, AC-27, EC-9)', async () => {
    const { service, store } = setup([A, B]);
    store.links = [
      { skillId: 'skill-on', skillName: 'On', linkEnabled: true, skillEnabled: true },
      { skillId: 'skill-link-off', skillName: 'LinkOff', linkEnabled: false, skillEnabled: true },
      { skillId: 'skill-global-off', skillName: 'GlobalOff', linkEnabled: true, skillEnabled: false },
    ];
    store.attachments.set('skill:skill-on:' + REPO.id, ['docs/a.md', '.devdigest/specs/b.md']);
    store.attachments.set('skill:skill-link-off:' + REPO.id, ['docs/a.md']);
    store.attachments.set('skill:skill-global-off:' + REPO.id, ['docs/a.md']);
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/a.md']); // direct beats skill

    const view = await service.getAgentAttachments(WS, 'agent-1', REPO.id);
    expect(view.inherited.map((d) => [d.path, d.via_skill_id, d.via_skill_name])).toEqual([
      ['.devdigest/specs/b.md', 'skill-on', 'On'],
    ]);
    expect(view.totals.context_tokens).toBe(view.items[0]!.tokens);
    expect(view.totals.specs_tokens).toBe(view.inherited[0]!.tokens);
    expect(view.totals.total).toBe(view.totals.context_tokens + view.totals.specs_tokens);
  });

  it('warns about docs that would be skipped over_budget, in prompt order (AC-54)', async () => {
    const filler = (n: number) => 'x'.repeat(n);
    const d1 = blob('docs/d1.md', filler(400)); // ~100+ tokens each
    const d2 = blob('docs/d2.md', filler(400));
    const d3 = blob('docs/d3.md', filler(400));
    const huge = blob('docs/huge.md', filler(4000)); // over the 150-token cap
    const { service, store } = setup([d1, d2, d3, huge], { limits: { docCapTokens: 150, runBudgetTokens: 200 } });
    store.links = [{ skillId: 'skill-1', skillName: 'S', linkEnabled: true, skillEnabled: true }];
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/huge.md', 'docs/d1.md', 'docs/d2.md']);
    store.attachments.set(`skill:skill-1:${REPO.id}`, ['docs/d3.md']);

    const view = await service.getAgentAttachments(WS, 'agent-1', REPO.id);
    expect(view.would_skip).toEqual([
      { path: 'docs/huge.md', section: 'project_context' },
      { path: 'docs/d2.md', section: 'project_context' },
      { path: 'docs/d3.md', section: 'project_specifications' },
    ]);
    expect(view.items.find((i) => i.path === 'docs/huge.md')!.over_cap).toBe(true);
    expect(view.totals.total).toBeLessThanOrEqual(200);

    const skillView = await service.getSkillAttachments(WS, 'skill-1', REPO.id);
    expect(skillView.would_skip).toEqual([]);
    expect(skillView.items.map((i) => i.path)).toEqual(['docs/d3.md']);
  });

  it('skill sets validate and save like agent sets; unknown owners are not found (AC-48)', async () => {
    const { service, store } = setup([A]);
    const view = await service.setSkillAttachments(WS, 'skill-9', REPO.id, ['docs/a.md']);
    expect(view.items.map((i) => i.path)).toEqual(['docs/a.md']);
    expect(view.total_tokens).toBeGreaterThan(0);
    await expect(service.setSkillAttachments(WS, 'skill-9', REPO.id, ['nope.md'])).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getAgentAttachments(WS, 'agent-x', REPO.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getSkillAttachments('other-ws', 'skill-9', REPO.id)).rejects.toBeInstanceOf(NotFoundError);
    const before = store.replaceCalls;
    await expect(service.setAgentAttachments(WS, 'agent-x', REPO.id, ['docs/a.md'])).rejects.toBeInstanceOf(NotFoundError);
    expect(store.replaceCalls).toBe(before);
  });

  it('the repo_unavailable error carries the AppError shape', async () => {
    const git = new MockGitClient();
    git.currentHead = async () => {
      throw new Error('no clone');
    };
    const { service } = setup([], { git });
    const err = await service.getAgentAttachments(WS, 'agent-1', REPO.id).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('project_context_repo_unavailable');
  });
});

describe('ProjectContextService.resolveForRun', () => {
  const run = (service: ProjectContextService, skills: { skillId: string; name: string }[] = [], intentRefs: string[] = []) =>
    service.resolveForRun({
      workspaceId: WS,
      repoId: REPO.id,
      owner: REPO.owner,
      name: REPO.name,
      agentId: 'agent-1',
      skills,
      intentRefs,
    });

  it('injects agent docs as context and skill docs as specs, with parity tokens and specs_read order (AC-28, AC-38, AC-44)', async () => {
    const { service, store } = setup([A, B]);
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/a.md']);
    store.attachments.set(`skill:skill-1:${REPO.id}`, ['.devdigest/specs/b.md']);

    const r = await run(service, [{ skillId: 'skill-1', name: 'Arch' }], ['plans/p.md', 'docs/a.md']);
    expect(r.contextDocs.map((d) => d.path)).toEqual(['docs/a.md']);
    expect(r.specsDocs.map((d) => d.path)).toEqual(['.devdigest/specs/b.md']);
    expect(r.contextDocs[0]!.tokens).toBe(tokenizer.count(renderProjectDocBlock({ path: 'docs/a.md', content: '# A\n\nalpha' })));
    expect(r.tokens).toEqual({ context: r.contextDocs[0]!.tokens, specs: r.specsDocs[0]!.tokens });
    expect(r.records.map((x) => [x.path, x.section, x.source, x.status])).toEqual([
      ['docs/a.md', 'project_context', 'agent', 'injected'],
      ['.devdigest/specs/b.md', 'project_specifications', 'Arch', 'injected'],
    ]);
    // injected paths first, intent refs after, no duplicates
    expect(r.specsRead).toEqual(['docs/a.md', '.devdigest/specs/b.md', 'plans/p.md']);
  });

  it('returns nothing and touches no git when nothing is attached (AC-33)', async () => {
    const { service } = setup([A]);
    const r = await run(service, [], ['plans/p.md']);
    expect(r).toMatchObject({ contextDocs: [], specsDocs: [], records: [], injectedPaths: [], specsRead: ['plans/p.md'] });
  });

  it('skips with the right reason: missing, not_matched, unsafe, unreadable, empty, over_budget (AC-32, AC-34, EC-1..EC-6)', async () => {
    const empty = blob('docs/empty.md', '  \n ');
    const unreadable = blob('docs/gone.md', 'x');
    const huge = blob('docs/huge.md', 'word '.repeat(5000)); // > doc cap
    const files = [A, LINK, empty, unreadable, huge, README];
    const git = new MockGitClient({
      tree: files.map((f) => f.entry),
      // no filesAt for docs/gone.md -> readFileAt throws
      filesAt: Object.fromEntries(files.filter((f) => f !== unreadable).map((f) => f.at)),
    });
    const { service, store } = setup([], { git });
    store.attachments.set(`agent:agent-1:${REPO.id}`, [
      'docs/removed.md',
      'README.md',
      'docs/link.md',
      'docs/gone.md',
      'docs/empty.md',
      'docs/huge.md',
      'docs/a.md',
    ]);
    const r = await run(service);
    expect(r.records.map((x) => [x.path, x.status, x.reason])).toEqual([
      ['docs/removed.md', 'skipped', 'missing'],
      ['README.md', 'skipped', 'not_matched'],
      ['docs/link.md', 'skipped', 'unsafe'],
      ['docs/gone.md', 'skipped', 'unreadable'],
      ['docs/empty.md', 'skipped', 'empty'],
      ['docs/huge.md', 'skipped', 'over_budget'],
      ['docs/a.md', 'injected', undefined],
    ]);
    expect(r.injectedPaths).toEqual(['docs/a.md']);
  });

  it('applies the run budget in prompt order; a skipped doc consumes nothing so a smaller later doc fits (AC-34)', async () => {
    const big = blob('docs/big.md', 'x'.repeat(400));
    const mid = blob('docs/mid.md', 'y'.repeat(400));
    const small = blob('docs/small.md', 'z');
    const { service, store } = setup([big, mid, small], { limits: { docCapTokens: 500, runBudgetTokens: 150 } });
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/big.md', 'docs/mid.md', 'docs/small.md']);
    const r = await run(service);
    expect(r.records.map((x) => [x.path, x.status, x.reason])).toEqual([
      ['docs/big.md', 'injected', undefined],
      ['docs/mid.md', 'skipped', 'over_budget'],
      ['docs/small.md', 'injected', undefined],
    ]);
  });

  it('dedupes: direct beats skill, several skills give one copy (AC-27, EC-8)', async () => {
    const { service, store } = setup([A, B]);
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/a.md']);
    store.attachments.set(`skill:skill-1:${REPO.id}`, ['docs/a.md', '.devdigest/specs/b.md']);
    store.attachments.set(`skill:skill-2:${REPO.id}`, ['.devdigest/specs/b.md']);
    const r = await run(service, [
      { skillId: 'skill-1', name: 'One' },
      { skillId: 'skill-2', name: 'Two' },
    ]);
    expect(r.contextDocs.map((d) => d.path)).toEqual(['docs/a.md']);
    expect(r.specsDocs.map((d) => d.path)).toEqual(['.devdigest/specs/b.md']);
    expect(r.records).toHaveLength(2);
    expect(r.records[1]!.source).toBe('One');
  });

  it('only resolves skills the caller passed (disabled skills are filtered by the executor) and only this repo', async () => {
    const { service, store } = setup([A, B]);
    store.attachments.set(`skill:skill-off:${REPO.id}`, ['docs/a.md']);
    store.attachments.set(`agent:agent-1:other-repo`, ['.devdigest/specs/b.md']);
    const r = await run(service, []);
    expect(r.records).toEqual([]);
  });

  it('degrades to repo_unavailable records when the clone is missing and never throws (EC-3)', async () => {
    const git = new MockGitClient();
    git.currentHead = async () => {
      throw new Error('no clone');
    };
    const { service, store } = setup([], { git });
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/a.md']);
    const r = await run(service, [], ['plans/p.md']);
    expect(r.contextDocs).toEqual([]);
    expect(r.records.map((x) => [x.path, x.status, x.reason])).toEqual([['docs/a.md', 'skipped', 'repo_unavailable']]);
    expect(r.specsRead).toEqual(['plans/p.md']);

    store.listAttachments = async () => {
      throw new Error('db down');
    };
    await expect(run(service)).resolves.toMatchObject({ records: [] });
  });

  it('never reads a stored path that is traversal, delimiter-breaking or a submodule; the safe doc still injects (NFR-1, EC-3, EC-4)', async () => {
    const { service, store, git } = setup([A, SUB]);
    const reads: string[] = [];
    const original = git.readFileAt.bind(git);
    git.readFileAt = (async (...args: Parameters<typeof original>) => {
      reads.push(args[2]);
      return original(...args);
    }) as typeof git.readFileAt;
    // A tampered / legacy row: attachments are validated on save, but the run must not trust the store.
    store.attachments.set(`agent:agent-1:${REPO.id}`, [
      '../../etc/passwd.md',
      '/abs/docs/a.md',
      'docs/a"><script>.md',
      'docs/sub.md',
      'docs/a.md',
    ]);
    const r = await run(service);
    expect(r.records.filter((x) => x.status === 'skipped')).toHaveLength(4);
    expect(r.records.find((x) => x.path === 'docs/sub.md')).toMatchObject({ status: 'skipped' });
    expect(r.injectedPaths).toEqual(['docs/a.md']);
    expect(reads).toEqual(['docs/a.md']);
  });

  it('keeps the saved order of agent docs, not alphabetical (AC-17, AC-28)', async () => {
    const { service, store } = setup([A, B]);
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/a.md', '.devdigest/specs/b.md']);
    expect((await run(service)).contextDocs.map((d) => d.path)).toEqual(['docs/a.md', '.devdigest/specs/b.md']);
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['.devdigest/specs/b.md', 'docs/a.md']);
    expect((await run(service)).contextDocs.map((d) => d.path)).toEqual(['.devdigest/specs/b.md', 'docs/a.md']);
  });

  it('after a sync moves the default branch, the next list shows new files and recounted tokens (AC-9)', async () => {
    const tree: TreeEntry[] = [A.entry];
    const filesAt: Record<string, string> = { [A.at[0]]: A.at[1] };
    const git = new MockGitClient({ tree, filesAt });
    const { service } = setup([], { git });
    const before = await service.list(WS, REPO.id);
    expect(before.total_files).toBe(1);

    // sync: a new tip commit where docs/a.md grew and docs/b.md appeared
    const NEW_SHA = 'c0ffee01';
    git.currentHead = async () => NEW_SHA;
    const grown = 'alpha '.repeat(200);
    filesAt[`${NEW_SHA}:docs/a.md`] = grown;
    filesAt[`${NEW_SHA}:${B.entry.path}`] = B.at[1];
    tree[0] = { ...A.entry, size: Buffer.byteLength(grown), sha: 'e'.repeat(40) };
    tree.push(B.entry);

    const after = await service.list(WS, REPO.id);
    expect(after.total_files).toBe(2);
    expect(after.documents.find((d) => d.path === 'docs/a.md')!.tokens).toBeGreaterThan(before.documents[0]!.tokens);
    expect(after.total_tokens).toBe(after.documents.reduce((n, d) => n + d.tokens, 0));
  });

  it('injected text of an in-progress run is unchanged by a later change to the clone (AC-36, EC-14)', async () => {
    const tree: TreeEntry[] = [A.entry];
    const filesAt: Record<string, string> = { [A.at[0]]: A.at[1] };
    const git = new MockGitClient({ tree, filesAt });
    const { service, store } = setup([], { git });
    store.attachments.set(`agent:agent-1:${REPO.id}`, ['docs/a.md']);

    const resolved = await run(service);
    const injectedBefore = resolved.contextDocs.map((d) => ({ ...d }));
    expect(injectedBefore[0]!.content).toBe(A.at[1]);

    // the clone changes after the run read it (sync moved the tip, file rewritten, then removed)
    git.currentHead = async () => 'c0ffee02';
    filesAt[A.at[0]] = 'REWRITTEN BY A LATER SYNC';
    filesAt['c0ffee02:docs/a.md'] = 'REWRITTEN BY A LATER SYNC';
    tree.length = 0;

    expect(resolved.contextDocs).toEqual(injectedBefore);
    expect(JSON.stringify(resolved)).not.toContain('REWRITTEN');
    // a NEW run does observe the change, proving the mutation took effect
    expect((await run(service)).contextDocs).toEqual([]);
  });

  it('resolves 20 docs quickly with one tree snapshot (NFR-5)', async () => {
    const docs = Array.from({ length: 20 }, (_, i) => blob(`docs/d${i}.md`, `# doc ${i}`));
    const { service, store } = setup(docs);
    store.attachments.set(`agent:agent-1:${REPO.id}`, docs.map((d) => d.entry.path));
    const t0 = Date.now();
    const r = await run(service);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r.contextDocs).toHaveLength(20);
  });
});
