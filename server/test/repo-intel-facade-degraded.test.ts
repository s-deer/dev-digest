import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoBasics } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * T1.4 — Facade degraded contract (acceptance #10).
 *
 * When `repoIntelEnabled=false` (opt-out; the default is now ON), every facade
 * method MUST return a safe degraded value WITHOUT throwing. Consumers (run-executor,
 * blast, hooks) downgrade to their pre-T1.3 behavior on these returns; if any
 * method threw or returned malformed shape, every consumer would crash.
 *
 * No Postgres, no clone. The service's `repo` (RepoIntelRepository) is patched
 * to return null/[] so we exercise the degraded paths cleanly.
 */

function buildDegradedService(opts: {
  flag: boolean;
  basics?: RepoBasics | null;
  indexStateRow?: IndexState | null;
  symbolRows?: unknown[];
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    // codeIndex is reached by getBlastRadius; we stub minimal behaviour.
    codeIndex: {
      symbols: async () => [],
      references: async () => [],
    } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => opts.basics ?? null,
    tryGetIndexState: async () => opts.indexStateRow ?? null,
    getCachedSymbols: async () => [],
    getCachedSymbolsForFiles: async () => [],
    getCachedReferencesTo: async () => [],
    getSymbolRows: async () => opts.symbolRows ?? [],
    getResolvedCallers: async () => [],
    getFileFacts: async () => [],
  };
  return svc;
}

/** Minimal `IndexState` fixture — only the fields `getBlastRadius` reads. */
function indexState(overrides: Partial<IndexState>): IndexState {
  return {
    repoId: 'r1',
    status: 'failed',
    filesIndexed: 0,
    filesSkipped: 0,
    durationMs: 0,
    lastIndexedSha: '',
    indexerVersion: 2,
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('RepoIntel facade — degraded contract (flag off)', () => {
  it('getUnresolvedReferences → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getBlastRadius → degraded-but-valid shape (never throws)', async () => {
    const svc = buildDegradedService({ flag: false, basics: null });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    // Shape (every key present, arrays where arrays go) — consumers assume this.
    expect(Array.isArray(blast.changedSymbols)).toBe(true);
    expect(Array.isArray(blast.callers)).toBe(true);
    expect(Array.isArray(blast.impactedEndpoints)).toBe(true);
    expect(blast.degraded).toBe(true);
    // reason is one of the documented DegradedReason values
    expect(['flag_off', 'no_data', 'index_failed', 'index_partial', 'repo_too_large'])
      .toContain(blast.reason);
  });

  it('getBlastRadius ripgrep fallback excludes references from the symbol\'s declaring file', async () => {
    const svc = buildDegradedService({
      flag: false,
      basics: { owner: 'o', name: 'n', clonePath: '/nonexistent-clone' } as RepoBasics,
    });
    (svc as unknown as { container: Record<string, unknown> }).container.codeIndex = {
      symbols: async () => [
        { name: 'foo', path: 'a.ts', kind: 'function', line: 1 },
        { name: 'caller', path: 'b.ts', kind: 'function', line: 1 },
      ],
      references: async () => [
        { fromPath: 'a.ts', line: 5 },
        { fromPath: 'b.ts', line: 3 },
      ],
    };
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.callers.map((c) => c.file)).toEqual(['b.ts']);
  });

  it('getIndexState → degraded row (never throws) when no row exists', async () => {
    const svc = buildDegradedService({ flag: false, indexStateRow: null });
    const state = await svc.getIndexState('r1');
    // Always-present fields the UI / dashboard rely on (client bind).
    expect(state.repoId).toBe('r1');
    expect(state.status).toBe('degraded');
    expect(state.filesIndexed).toBe(0);
    expect(state.filesSkipped).toBe(0);
    expect(state.lastIndexedSha).toBe(''); // empty string, not undefined — JSON-safe
    expect(state.indexerVersion).toBeGreaterThanOrEqual(1);
    expect(state.updatedAt instanceof Date).toBe(true);
    expect(state.degraded).toBe(true);
  });

  it('getRepoMap → degraded ({ text:"", tokens:0, cached:false, degraded:true })', async () => {
    const svc = buildDegradedService({ flag: false });
    const map = await svc.getRepoMap('r1');
    expect(map.text).toBe('');
    expect(map.tokens).toBe(0);
    expect(map.cached).toBe(false);
    expect(map.degraded).toBe(true);
  });

  it('getFileRank / getSymbolsInFiles / getConventionSamples / getTopFilesByRank / getCriticalPaths → []', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getFileRank('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getSymbolsInFiles('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getConventionSamples('r1', 12)).resolves.toEqual([]);
    await expect(svc.getTopFilesByRank('r1', 7)).resolves.toEqual([]);
    await expect(svc.getCriticalPaths('r1')).resolves.toEqual([]);
  });

  it('indexRepo / refreshIndex → degraded T1 skeleton (never throws)', async () => {
    const svc = buildDegradedService({ flag: false });
    const a = await svc.indexRepo('r1');
    const b = await svc.refreshIndex('r1');
    expect(a.status).toBe('degraded');
    expect(b.status).toBe('degraded');
    expect(a.filesIndexed).toBe(0);
    expect(b.filesIndexed).toBe(0);
  });
});

describe('RepoIntel facade — degraded contract (flag on, but no data)', () => {
  it('getCallerSignatures with no clone → [] (graceful degrade, no throw)', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getUnresolvedReferences with no clone → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures with empty changedFiles → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: '/tmp' } });
    await expect(svc.getCallerSignatures('r1', [])).resolves.toEqual([]);
  });
});

describe('RepoIntel facade — getBlastRadius honest degradation (T1.4 / L04 S2)', () => {
  it('reason is flag_off when repoIntelEnabled=false, even over a failed index state', async () => {
    const svc = buildDegradedService({
      flag: false,
      basics: null,
      indexStateRow: indexState({ status: 'failed', degradedReason: 'repo_too_large' }),
    });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('flag_off');
  });

  it('fallback reason is index_failed when the persisted index state is failed', async () => {
    const svc = buildDegradedService({
      flag: true,
      basics: null, // no clone → falls through to the empty fallback
      indexStateRow: indexState({ status: 'failed' }),
    });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_failed');
  });

  it('fallback reason defaults to no_data with no persisted index state at all', async () => {
    const svc = buildDegradedService({ flag: true, basics: null, indexStateRow: null });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('no_data');
  });

  it('a partial persistent index reports degraded:true, reason:index_partial (no symbols in changed files)', async () => {
    const svc = buildDegradedService({
      flag: true,
      indexStateRow: indexState({ status: 'partial' }),
      symbolRows: [],
    });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
    expect(blast.callers).toEqual([]);
  });

  it('a partial persistent index reports degraded:true, reason:index_partial (with symbols found)', async () => {
    const svc = buildDegradedService({
      flag: true,
      indexStateRow: indexState({ status: 'partial' }),
      symbolRows: [{ path: 'a.ts', name: 'foo', kind: 'function', line: 1, endLine: 5, exported: true, signature: null }],
    });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
    expect(blast.changedSymbols).toEqual([{ file: 'a.ts', name: 'foo', kind: 'function' }]);
  });

  it('a full persistent index is not degraded', async () => {
    const svc = buildDegradedService({
      flag: true,
      indexStateRow: indexState({ status: 'full' }),
      symbolRows: [],
    });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(false);
    expect(blast.reason).toBeUndefined();
  });
});
