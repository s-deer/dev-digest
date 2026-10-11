import { describe, expect, it } from 'vitest';
import type { BriefModelOutput } from '@devdigest/shared';
import { deriveFacts, groundBrief, isStale, parseHunkRanges } from '../src/modules/brief/domain.js';

const PATCH = [
  '@@ -10,3 +10,4 @@ export function a() {',
  ' ctx',
  '+added',
  ' ctx',
  '@@ -40 +50 @@',
  '-old',
  '+new',
  '@@ -60,2 +70,0 @@',
  '-gone',
  '-gone2',
].join('\n');

describe('parseHunkRanges', () => {
  it('reads head-side ranges, treats a missing count as 1 and skips d=0', () => {
    expect(parseHunkRanges(PATCH)).toEqual([
      { start: 10, end: 13 },
      { start: 50, end: 50 },
    ]);
  });
  it('returns [] for null, empty and header-less patches', () => {
    expect(parseHunkRanges(null)).toEqual([]);
    expect(parseHunkRanges('')).toEqual([]);
    expect(parseHunkRanges('+just a line\n-another')).toEqual([]);
  });
});

const changed = new Map([
  ['src/a.ts', [{ start: 10, end: 13 }, { start: 50, end: 50 }]],
  ['docs/readme.md', []],
  ['src/deleted.ts', []],
]);
const callers = [
  { file: 'src/caller.ts', line: 7 },
  { file: 'src/caller.ts', line: 21 },
  { file: 'src/a.ts', line: 99 },
  { file: 'docs/readme.md', line: 4 },
  { file: 'docs/readme.md', line: 12 },
];

function out(partial: Partial<BriefModelOutput>): BriefModelOutput {
  return { summary: 's', risks: [], review_focus: [], ...partial };
}
const risk = (file_refs: string[], line: number | null = null) => ({
  file_refs,
  line,
  explanation: 'e',
  title: 't',
  kind: 'k',
  severity: 'low' as const,
});

describe('groundBrief', () => {
  it('drops invented, line-suffixed and absolute paths; a multi-ref risk keeps its grounded refs', () => {
    const r = groundBrief(
      out({
        risks: [
          risk(['src/a.ts', 'src/invented.ts']),
          risk(['src/a.ts:12']),
          risk(['/abs/src/a.ts']),
          risk(['src/caller.ts']),
        ],
      }),
      { changed, callers },
    );
    expect(r.risks.map((x) => x.file_refs)).toEqual([['src/a.ts'], ['src/caller.ts']]);
    expect(r.grounding).toMatchObject({ risks_dropped: 2, risk_refs_removed: 3 });
  });

  it('keeps in-range lines and caller lines unchanged, snaps others to the nearest hunk start (tie: earlier)', () => {
    const r = groundBrief(
      out({
        review_focus: [
          { file: 'src/a.ts', line: 12, reason: 'in range' },
          { file: 'src/a.ts', line: 99, reason: 'caller line' },
          { file: 'src/a.ts', line: 48, reason: 'near second' },
          { file: 'src/a.ts', line: 31, reason: 'tie' },
          { file: 'src/a.ts', line: 1, reason: 'before first' },
        ],
      }),
      { changed, callers },
    );
    expect(r.review_focus.map((f) => f.line)).toEqual([12, 99, 50, 10, 10]);
    expect(r.grounding).toMatchObject({ focus_dropped: 0, focus_lines_snapped: 3 });
  });

  it('a patch-less file snaps to the nearest caller line (tie: earlier), or is dropped with none', () => {
    const r = groundBrief(
      out({
        review_focus: [
          { file: 'docs/readme.md', line: 8, reason: 'tie' },
          { file: 'docs/readme.md', line: 11, reason: 'near 12' },
          { file: 'src/deleted.ts', line: 3, reason: 'nothing to snap to' },
          { file: 'src/caller.ts', line: 20, reason: 'caller-only file' },
          { file: 'src/nope.ts', line: 1, reason: 'invented' },
        ],
      }),
      { changed, callers },
    );
    expect(r.review_focus.map((f) => [f.file, f.line])).toEqual([
      ['docs/readme.md', 4],
      ['docs/readme.md', 12],
      ['src/caller.ts', 21],
    ]);
    expect(r.grounding).toMatchObject({ focus_dropped: 2, focus_lines_snapped: 3 });
  });

  it('an all-ungrounded answer yields empty arrays and no error', () => {
    const r = groundBrief(
      out({ risks: [risk(['x.ts'])], review_focus: [{ file: 'x.ts', line: 1, reason: 'r' }] }),
      { changed, callers },
    );
    expect(r.risks).toEqual([]);
    expect(r.review_focus).toEqual([]);
  });

  it('preserves model order', () => {
    const r = groundBrief(
      out({ review_focus: [{ file: 'src/a.ts', line: 50, reason: 'b' }, { file: 'src/a.ts', line: 10, reason: 'a' }] }),
      { changed, callers },
    );
    expect(r.review_focus.map((f) => f.reason)).toEqual(['b', 'a']);
  });
});

describe('groundBrief risk lines', () => {
  const g = (risks: ReturnType<typeof risk>[]) => groundBrief(out({ risks }), { changed, callers });

  it('keeps an in-range line and a caller line unchanged and counts nothing', () => {
    const r = g([risk(['src/a.ts'], 12), risk(['src/a.ts'], 99)]);
    expect(r.risks.map((x) => x.line)).toEqual([12, 99]);
    expect(r.grounding).toMatchObject({ risk_lines_snapped: 0, risk_lines_dropped: 0 });
  });

  it('snaps an out-of-range line to the nearest hunk start (tie: earlier) and counts it', () => {
    const r = g([risk(['src/a.ts'], 48), risk(['src/a.ts'], 31)]);
    expect(r.risks.map((x) => x.line)).toEqual([50, 10]);
    expect(r.grounding.risk_lines_snapped).toBe(2);
  });

  it('a first ref without hunks snaps to the nearest caller line', () => {
    const r = g([risk(['docs/readme.md'], 11)]);
    expect(r.risks[0]!.line).toBe(12);
    expect(r.grounding).toMatchObject({ risk_lines_snapped: 1, risk_lines_dropped: 0 });
  });

  it('a first ref with neither hunks nor callers: line null, risk kept, counted as dropped', () => {
    const r = g([risk(['src/deleted.ts'], 3)]);
    expect(r.risks).toHaveLength(1);
    expect(r.risks[0]!.line).toBeNull();
    expect(r.grounding).toMatchObject({ risk_lines_snapped: 0, risk_lines_dropped: 1 });
  });

  it('when the first ref was removed the line is null and is not moved to the new first ref', () => {
    const r = g([risk(['src/invented.ts', 'src/a.ts'], 12)]);
    expect(r.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(r.risks[0]!.line).toBeNull();
    expect(r.grounding.risk_lines_dropped).toBe(1);
  });

  it('a wholly dropped risk does not count its line', () => {
    const r = g([risk(['src/invented.ts'], 5)]);
    expect(r.risks).toEqual([]);
    expect(r.grounding).toMatchObject({ risks_dropped: 1, risk_lines_snapped: 0, risk_lines_dropped: 0 });
  });

  it('a null line stays null, counts nothing, and every risk has an own line property', () => {
    const r = g([risk(['src/a.ts'], null), risk(['src/caller.ts'], null)]);
    expect(r.risks.map((x) => x.line)).toEqual([null, null]);
    expect(r.grounding).toMatchObject({ risk_lines_snapped: 0, risk_lines_dropped: 0 });
    for (const x of r.risks) expect(Object.hasOwn(x, 'line')).toBe(true);
  });
});

describe('isStale', () => {
  it('compares SHAs and never reports stale for an unknown current head', () => {
    expect(isStale('a', 'a')).toBe(false);
    expect(isStale('a', 'b')).toBe(true);
    expect(isStale('a', null)).toBe(false);
    expect(isStale('a', undefined)).toBe(false);
    expect(isStale('a', '')).toBe(false);
  });
});

describe('deriveFacts', () => {
  const base = {
    intent: { stale: false },
    blast: { degraded: false, reason: null },
    linkedIssue: true,
    description: 'body',
    specs: { agent: { id: 'a', name: 'Reviewer' }, records: [{ path: 'docs/x.md', status: 'injected' as const }] },
  };
  it('maps present inputs', () => {
    expect(deriveFacts(base)).toMatchObject({
      intent: 'present',
      blast: { status: 'present' },
      linked_issue: 'present',
      description: 'present',
      specs: { status: 'included', included_paths: ['docs/x.md'], omitted_paths: [] },
    });
  });
  it('maps missing / stale / degraded / unavailable / empty', () => {
    expect(deriveFacts({ ...base, intent: null }).intent).toBe('missing');
    expect(deriveFacts({ ...base, intent: { stale: true } }).intent).toBe('stale');
    expect(deriveFacts({ ...base, blast: { degraded: true, reason: 'no_data' } }).blast).toEqual({
      status: 'degraded',
      reason: 'no_data',
    });
    expect(deriveFacts({ ...base, blast: null }).blast.status).toBe('unavailable');
    expect(deriveFacts({ ...base, linkedIssue: false, description: '  ' })).toMatchObject({
      linked_issue: 'none',
      description: 'empty',
    });
  });
  it('maps the specs states', () => {
    const s = (specs: typeof base.specs | { agent: null; records: [] } | { agent: { id: string; name: string }; records: null }) =>
      deriveFacts({ ...base, specs: specs as typeof base.specs }).specs.status;
    expect(s({ agent: null, records: [] })).toBe('no_agent');
    expect(s({ agent: base.specs.agent, records: [] as never })).toBe('none_attached');
    expect(s({ agent: base.specs.agent, records: null })).toBe('unavailable');
    expect(
      s({ agent: base.specs.agent, records: [{ path: 'a.md', status: 'skipped', reason: 'repo_unavailable' }] as never }),
    ).toBe('unavailable');
    const mixed = deriveFacts({
      ...base,
      specs: {
        agent: base.specs.agent,
        records: [
          { path: 'a.md', status: 'injected' },
          { path: 'b.md', status: 'skipped', reason: 'over_budget' },
        ],
      },
    });
    expect(mixed.specs).toMatchObject({ status: 'included', included_paths: ['a.md'], omitted_paths: ['b.md'] });
  });
});
