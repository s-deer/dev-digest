import { describe, expect, it } from 'vitest';
import {
  buildSpecsRead,
  compilePatterns,
  docTypeFor,
  isSafeDocPath,
  matchesPatterns,
  planProjectContext,
  type DocFacts,
} from '../src/modules/project-context/domain.js';
import { DEFAULT_PROJECT_CONTEXT_PATTERNS } from '../src/platform/config.js';

describe('discovery patterns', () => {
  const m = (path: string, patterns = DEFAULT_PROJECT_CONTEXT_PATTERNS) =>
    matchesPatterns(path, compilePatterns(patterns));

  it.each([
    ['docs/a.md', true],
    ['specs/a.md', true],
    ['insights/a.md', true],
    ['server/docs/specs/a.md', true],
    ['.devdigest/specs/a.md', true], // dot-directories match (D-15)
    ['node_modules/x/docs/a.md', true], // matches the glob; excluded later by being untracked
    ['README.md', false],
    ['src/notes/a.md', false],
    ['docs/a.txt', false],
    ['docs/A.MD', false], // case-sensitive
    ['docs/a.mdx', false],
  ])('default pattern: %s -> %s', (path, expected) => {
    expect(m(path)).toBe(expected);
  });

  it('supports *, ?, braces and a custom pattern', () => {
    expect(m('adr/0001-x.md', ['adr/*.md'])).toBe(true);
    expect(m('adr/sub/0001-x.md', ['adr/*.md'])).toBe(false);
    expect(m('adr/a1.md', ['adr/a?.md'])).toBe(true);
    expect(m('a/b.md', ['{a,c}/b.md'])).toBe(true);
    expect(m('d/b.md', ['{a,c}/b.md'])).toBe(false);
    expect(m('x.md', ['**/*.md'])).toBe(true);
    expect(m('a/b/c.md', ['a/**'])).toBe(true);
    // regex metacharacters in a pattern are literal
    expect(m('adrXmd', ['adr.md'])).toBe(false);
  });

  it('a custom pattern yields type "other" for a path with no type segment', () => {
    expect(m('notes/design.md', ['notes/*.md'])).toBe(true);
    expect(docTypeFor('notes/design.md')).toBe('other');
  });
});

describe('docTypeFor', () => {
  it.each([
    ['docs/a.md', 'docs'],
    ['server/docs/specs/a.md', 'specs'], // nearest to the file wins
    ['specs/docs/a.md', 'docs'],
    ['.devdigest/insights/a.md', 'insights'],
    ['docs/deep/er/a.md', 'docs'],
    ['README.md', 'other'],
    ['docs.md', 'other'], // the file name is not a folder segment
  ])('%s -> %s', (path, type) => {
    expect(docTypeFor(path)).toBe(type);
  });
});

describe('isSafeDocPath', () => {
  it.each([
    'docs/a.md',
    '.devdigest/specs/a.md',
    'docs/with space.md',
    'docs/a-b_c.v2.md',
  ])('accepts %s', (p) => expect(isSafeDocPath(p)).toBe(true));

  it.each([
    ['empty', ''],
    ['traversal', 'docs/../secrets.md'],
    ['leading traversal', '../a.md'],
    ['dot segment', 'docs/./a.md'],
    ['absolute', '/etc/a.md'],
    ['leading dash', '-rf/a.md'],
    ['dash segment', 'docs/-x/a.md'],
    ['double quote', 'docs/a"b.md'],
    ['angle brackets', 'docs/<a>.md'],
    ['backtick', 'docs/a`b.md'],
    ['newline', 'docs/a\nb.md'],
    ['NUL', 'docs/a\0.md'],
    ['colon', 'docs/a:b.md'],
    ['backslash', 'docs\\a.md'],
    ['.git prefix', '.git/x.md'],
    ['.git segment', 'docs/.git/x.md'],
    ['empty segment', 'docs//a.md'],
    ['trailing slash', 'docs/'],
    ['not markdown', 'docs/a.txt'],
    ['bare extension', 'docs/.md'],
    ['non-ascii', 'docs/ü.md'],
    ['delimiter breakout', 'docs/"><script>.md'],
  ])('rejects %s', (_name, p) => expect(isSafeDocPath(p)).toBe(false));
});

describe('planProjectContext', () => {
  const limits = { docCapTokens: 100, runBudgetTokens: 250 };
  const ok = (tokens: number, extra: Partial<DocFacts> = {}): DocFacts => ({
    tokens,
    overCap: false,
    state: 'ok',
    ...extra,
  });

  it('puts the agent list first, then skill docs; direct beats skill; several skills -> once (EC-8)', () => {
    const facts = new Map([
      ['a.md', ok(10)],
      ['b.md', ok(10)],
      ['c.md', ok(10)],
    ]);
    const plan = planProjectContext({
      agentPaths: ['b.md'],
      skillGroups: [
        { skillName: 'S1', paths: ['a.md', 'b.md'] },
        { skillName: 'S2', paths: ['c.md', 'a.md'] },
      ],
      facts,
      limits,
    });
    expect(plan.records.map((r) => [r.path, r.section, r.source, r.order])).toEqual([
      ['b.md', 'project_context', 'agent', 0],
      ['a.md', 'project_specifications', 'S1', 0],
      ['c.md', 'project_specifications', 'S2', 1],
    ]);
    expect(plan.injectedPaths).toEqual(['b.md', 'a.md', 'c.md']);
    expect(plan.contextTokens).toBe(10);
    expect(plan.specsTokens).toBe(20);
  });

  it('skips over the cap, then over the budget in prompt order; a smaller later doc still fits', () => {
    const facts = new Map([
      ['big.md', ok(150)], // over the 100-token cap
      ['d1.md', ok(100)],
      ['d2.md', ok(100)],
      ['d3.md', ok(100)], // 100+100+100 > 250 -> over budget
      ['small.md', ok(40)], // 200 + 40 <= 250 -> fits
    ]);
    const plan = planProjectContext({
      agentPaths: ['big.md', 'd1.md', 'd2.md'],
      skillGroups: [{ skillName: 'S', paths: ['d3.md', 'small.md'] }],
      facts,
      limits,
    });
    const byPath = Object.fromEntries(plan.records.map((r) => [r.path, [r.status, r.reason]]));
    expect(byPath).toEqual({
      'big.md': ['skipped', 'over_budget'],
      'd1.md': ['injected', undefined],
      'd2.md': ['injected', undefined],
      'd3.md': ['skipped', 'over_budget'],
      'small.md': ['injected', undefined],
    });
    expect(plan.wouldSkip).toEqual([
      { path: 'big.md', section: 'project_context' },
      { path: 'd3.md', section: 'project_specifications' },
    ]);
    expect(plan.contextTokens + plan.specsTokens).toBe(240);
  });

  it('records non-ok states with their reason, consumes nothing, and treats unknown paths as missing', () => {
    const facts = new Map<string, DocFacts>([
      ['gone.md', { tokens: 0, overCap: false, state: 'missing' }],
      ['link.md', { tokens: 0, overCap: false, state: 'unsafe' }],
      ['e.md', { tokens: 0, overCap: false, state: 'empty' }],
      ['fits.md', ok(250)],
    ]);
    const plan = planProjectContext({
      agentPaths: ['gone.md', 'link.md', 'e.md', 'nofacts.md', 'fits.md'],
      skillGroups: [],
      facts,
      limits: { docCapTokens: 300, runBudgetTokens: 250 },
    });
    expect(plan.records.map((r) => [r.path, r.reason])).toEqual([
      ['gone.md', 'missing'],
      ['link.md', 'unsafe'],
      ['e.md', 'empty'],
      ['nofacts.md', 'missing'],
      ['fits.md', undefined],
    ]);
    expect(plan.wouldSkip).toEqual([]);
    expect(plan.injectedPaths).toEqual(['fits.md']);
  });
});

describe('buildSpecsRead', () => {
  it('lists injected paths first, then Intent refs not already listed', () => {
    expect(buildSpecsRead(['docs/a.md', 'docs/b.md'], ['docs/plan.md', 'docs/a.md'])).toEqual([
      'docs/a.md',
      'docs/b.md',
      'docs/plan.md',
    ]);
    expect(buildSpecsRead([], [])).toEqual([]);
  });
});
