import type {
  BriefFacts,
  BriefFocusItem,
  BriefGrounding,
  BriefModelOutput,
  BriefReduction,
  BriefRiskRecord,
} from '@devdigest/shared';

/**
 * Pure domain logic for the PR Brief (L05): hunk ranges, the grounding gate,
 * the staleness rule and the "what was available" facts. No I/O, no framework.
 */

/** Inclusive head-side line range of one diff hunk. */
export interface LineRange {
  start: number;
  end: number;
}

export interface CallerLocation {
  file: string;
  line: number;
}

/** A PR as the brief needs it — a domain shape, never a Drizzle row. */
export interface BriefPullData {
  pull: { id: string; number: number; title: string; body: string | null; headSha: string };
  repo: { id: string; owner: string; name: string };
  files: { path: string; additions: number; deletions: number; patch: string | null }[];
}

/** Everything the grounding gate may accept, built from the FULL lists. */
export interface GroundingContext {
  changed: ReadonlyMap<string, readonly LineRange[]>;
  callers: readonly CallerLocation[];
}

export interface GroundedBrief {
  risks: BriefRiskRecord[];
  review_focus: BriefFocusItem[];
  grounding: BriefGrounding;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Head-side ranges of a unified-diff patch, from the `@@` headers only. */
export function parseHunkRanges(patch: string | null | undefined): LineRange[] {
  if (!patch) return [];
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('@@')) continue;
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count <= 0) continue;
    ranges.push({ start, end: start + count - 1 });
  }
  return ranges;
}

function distanceToRange(line: number, r: LineRange): number {
  if (line < r.start) return r.start - line;
  if (line > r.end) return line - r.end;
  return 0;
}

/**
 * Snaps a line onto something the PR contains: kept as is when inside a
 * changed hunk or on a caller line, else the nearest hunk start (ties: the
 * earlier hunk), else the nearest caller line (ties: the earlier line).
 * `null` when the file has neither hunks nor caller lines.
 */
function snapLine(
  file: string,
  line: number,
  ctx: GroundingContext,
): { line: number; snapped: boolean } | null {
  const ranges = ctx.changed.get(file) ?? [];
  const fileCallers = ctx.callers.filter((c) => c.file === file).map((c) => c.line);
  const inRange = ranges.some((r) => line >= r.start && line <= r.end);
  if (inRange || fileCallers.includes(line)) return { line, snapped: false };
  if (ranges.length > 0) {
    let best = ranges[0]!;
    for (const r of ranges) {
      if (distanceToRange(line, r) < distanceToRange(line, best)) best = r;
    }
    return { line: best.start, snapped: true };
  }
  if (fileCallers.length > 0) {
    let best = fileCallers[0]!;
    for (const l of fileCallers) {
      const d = Math.abs(l - line);
      const bd = Math.abs(best - line);
      if (d < bd || (d === bd && l < best)) best = l;
    }
    return { line: best, snapped: true };
  }
  return null;
}

/**
 * The grounding gate. Keeps only references the PR actually contains:
 * risk refs must be a changed or caller file; focus items must name such a
 * file and a line inside a changed hunk or on a caller line — otherwise the
 * line snaps (see `snapLine`), and an item with nothing to snap to is dropped.
 * A risk's `line` belongs to the model's FIRST file ref: it is grounded the
 * same way, but becomes `null` (risk kept) when that ref was removed or the
 * line cannot be snapped. A stored risk always carries an explicit `line`
 * (number or null). Model order is preserved. Never throws; an all-ungrounded
 * answer yields empty arrays.
 */
export function groundBrief(output: BriefModelOutput, ctx: GroundingContext): GroundedBrief {
  const callerFiles = new Set(ctx.callers.map((c) => c.file));
  const isGroundedFile = (file: string) => ctx.changed.has(file) || callerFiles.has(file);

  let risksDropped = 0;
  let refsRemoved = 0;
  let riskLinesSnapped = 0;
  let riskLinesDropped = 0;
  const risks: BriefRiskRecord[] = [];
  for (const risk of output.risks) {
    const refs = risk.file_refs.filter(isGroundedFile);
    refsRemoved += risk.file_refs.length - refs.length;
    if (refs.length === 0) {
      risksDropped += 1;
      continue;
    }
    let line: number | null = null;
    if (risk.line !== null) {
      const firstSurvived = refs[0] === risk.file_refs[0];
      const snap = firstSurvived ? snapLine(refs[0]!, risk.line, ctx) : null;
      if (snap) {
        line = snap.line;
        if (snap.snapped) riskLinesSnapped += 1;
      } else {
        riskLinesDropped += 1;
      }
    }
    risks.push({ ...risk, file_refs: refs, line });
  }

  let focusDropped = 0;
  let snapped = 0;
  const focus: BriefFocusItem[] = [];
  for (const item of output.review_focus) {
    if (!isGroundedFile(item.file)) {
      focusDropped += 1;
      continue;
    }
    const snap = snapLine(item.file, item.line, ctx);
    if (!snap) {
      focusDropped += 1;
      continue;
    }
    if (snap.snapped) {
      snapped += 1;
      focus.push({ ...item, line: snap.line });
    } else {
      focus.push(item);
    }
  }

  return {
    risks,
    review_focus: focus,
    grounding: {
      risks_dropped: risksDropped,
      risk_refs_removed: refsRemoved,
      focus_dropped: focusDropped,
      focus_lines_snapped: snapped,
      risk_lines_snapped: riskLinesSnapped,
      risk_lines_dropped: riskLinesDropped,
    },
  };
}

/** A stored brief is outdated once the PR head moved; an unknown current head never counts as stale. */
export function isStale(storedSha: string, currentSha: string | null | undefined): boolean {
  if (!currentSha) return false;
  return storedSha !== currentSha;
}

export interface SpecRecordLike {
  path: string;
  status: 'injected' | 'skipped';
  reason?: string;
}

export interface DeriveFactsInput {
  /** `null` = no intent derived yet. */
  intent: { stale: boolean } | null;
  /** `null` = the blast radius could not be built. */
  blast: { degraded: boolean; reason: string | null } | null;
  linkedIssue: boolean;
  description: string | null | undefined;
  specs: {
    agent: { id: string; name: string } | null;
    /** `null` = resolving the attachments failed. */
    records: readonly SpecRecordLike[] | null;
  };
}

export function deriveFacts(input: DeriveFactsInput): BriefFacts {
  const { intent, blast, specs } = input;
  const records = specs.records ?? [];
  let specsStatus: BriefFacts['specs']['status'];
  if (!specs.agent) specsStatus = 'no_agent';
  else if (specs.records === null) specsStatus = 'unavailable';
  else if (records.length === 0) specsStatus = 'none_attached';
  else if (records.every((r) => r.status === 'skipped' && r.reason === 'repo_unavailable')) specsStatus = 'unavailable';
  else specsStatus = 'included';

  return {
    intent: !intent ? 'missing' : intent.stale ? 'stale' : 'present',
    blast: !blast
      ? { status: 'unavailable' }
      : blast.degraded
        ? { status: 'degraded', ...(blast.reason ? { reason: blast.reason } : {}) }
        : { status: 'present' },
    linked_issue: input.linkedIssue ? 'present' : 'none',
    description: input.description && input.description.trim().length > 0 ? 'present' : 'empty',
    specs: {
      status: specsStatus,
      agent: specs.agent,
      included_paths: records.filter((r) => r.status === 'injected').map((r) => r.path),
      omitted_paths: records.filter((r) => r.status === 'skipped').map((r) => r.path),
    },
  };
}

/** Content-free log line, emitted exactly once per generation. */
export interface BriefLogLine {
  prId: string;
  outcome: string;
  provider: string | null;
  model: string | null;
  attempts: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  input_tokens_total: number;
  input_tokens_by_source: Record<string, number>;
  reductions: BriefReduction[];
  grounding: BriefGrounding | null;
  duration_ms_non_model: number;
}
