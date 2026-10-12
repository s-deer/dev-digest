import { renderProjectDocBlock, wrapUntrusted } from '@devdigest/reviewer-core';
import type { BriefReduction } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { BRIEF_INPUT_BUDGET, BRIEF_REDUCTION_ORDER, BRIEF_SHARES, type BriefSource } from './constants.js';
import type { LineRange } from './domain.js';
import { SYSTEM_PROMPT, TASK } from './prompt.js';

/**
 * Builds the first-sent model input from precomputed facts. Takes file
 * statistics and hunk RANGES only — a diff body never reaches this module.
 * Pure: the tokenizer is a port passed in. Every source sits in its own
 * delimited block; each is tail-cut to its share, then the total is brought
 * under the budget in `BRIEF_REDUCTION_ORDER`, or the build fails.
 */

export interface BriefInputFile {
  path: string;
  additions: number;
  deletions: number;
  role: string;
  ranges: readonly LineRange[];
}

export interface BriefInputFacts {
  title: string;
  intent: {
    intent: string;
    in_scope: string[];
    out_of_scope: string[];
    change_type: string;
    confidence: string;
    stale: boolean;
  } | null;
  blast: {
    degraded: boolean;
    reason: string | null;
    summary: string;
    changed_symbols: { name: string; file: string; kind: string }[];
    downstream: {
      symbol: string;
      callers: { name: string; file: string; line: number }[];
      endpoints_affected: string[];
      crons_affected: string[];
    }[];
  } | null;
  description: string | null;
  issue: { number: number; title: string; body: string | null } | null;
  specs: { path: string; content: string }[];
  files: BriefInputFile[];
}

export type BriefInputResult =
  | {
      ok: true;
      system: string;
      user: string;
      tokensTotal: number;
      tokensBySource: Record<string, number>;
      reductions: BriefReduction[];
      specsIncluded: string[];
      specsOmitted: string[];
    }
  | { ok: false; reason: 'budget'; tokensTotal: number };

/** `</untrusted` in any case can't close our block (wrapUntrusted only handles the exact lowercase tag). */
export function sanitizeUntrusted(text: string): string {
  return text.replace(/<\/untrusted/gi, '<\\/untrusted');
}

/** A path/symbol on one line, with no way to close a block. */
export function sanitizeInline(text: string): string {
  return sanitizeUntrusted(text.replace(/[\r\n]+/g, ' '));
}

interface Rendered {
  text: string;
  itemsOmitted: number;
}

/** Cuts `items` to the longest prefix whose render fits `cap` tokens. */
function fitItems<T>(items: readonly T[], cap: number, tokenizer: Tokenizer, render: (kept: readonly T[]) => string): Rendered {
  const full = render(items);
  if (full === '' || tokenizer.count(full) <= cap) return { text: full, itemsOmitted: 0 };
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tokenizer.count(render(items.slice(0, mid))) <= cap) lo = mid;
    else hi = mid - 1;
  }
  return { text: render(items.slice(0, lo)), itemsOmitted: items.length - lo };
}

/** Cuts text content (tail) so `render(content)` fits `cap` tokens; `''` when even the empty wrapper doesn't fit. */
function fitText(content: string, cap: number, tokenizer: Tokenizer, render: (c: string) => string): Rendered {
  const full = render(content);
  if (content.trim() === '') return { text: '', itemsOmitted: 0 };
  if (tokenizer.count(full) <= cap) return { text: full, itemsOmitted: 0 };
  const totalLines = content.split('\n').length;
  let lo = 0;
  let hi = content.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tokenizer.count(render(content.slice(0, mid))) <= cap) lo = mid;
    else hi = mid - 1;
  }
  const kept = content.slice(0, lo);
  if (kept.trim() === '') return { text: '', itemsOmitted: totalLines };
  return { text: render(kept), itemsOmitted: Math.max(0, totalLines - kept.split('\n').length) };
}

const formatRanges = (ranges: readonly LineRange[]): string =>
  ranges.length === 0 ? 'no changed line ranges' : ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(', ');

function intentContent(f: BriefInputFacts['intent']): string {
  if (!f) return '';
  const lines = [
    ...(f.stale ? ['[STALE: derived for an earlier head commit of this PR]'] : []),
    `Intent: ${sanitizeUntrusted(f.intent)}`,
    `Change type: ${f.change_type}; confidence: ${f.confidence}`,
    ...(f.in_scope.length ? ['In scope:', ...f.in_scope.map((s) => `- ${sanitizeUntrusted(s)}`)] : []),
    ...(f.out_of_scope.length ? ['Out of scope:', ...f.out_of_scope.map((s) => `- ${sanitizeUntrusted(s)}`)] : []),
  ];
  return lines.join('\n');
}

function blastContent(b: BriefInputFacts['blast']): string {
  if (!b) return '';
  const lines = [
    ...(b.degraded ? [`[DEGRADED blast radius: ${b.reason ?? 'unknown reason'}]`] : []),
    `Summary: ${sanitizeInline(b.summary)}`,
    ...b.changed_symbols.map((s) => `changed: ${sanitizeInline(s.name)} (${sanitizeInline(s.kind)}) in ${sanitizeInline(s.file)}`),
    ...b.downstream.flatMap((d) => [
      `symbol ${sanitizeInline(d.symbol)}:`,
      ...d.callers.map((c) => `  caller ${sanitizeInline(c.name)} at ${sanitizeInline(c.file)}:${c.line}`),
      ...(d.endpoints_affected.length ? [`  endpoints: ${d.endpoints_affected.map(sanitizeInline).join(', ')}`] : []),
      ...(d.crons_affected.length ? [`  crons: ${d.crons_affected.map(sanitizeInline).join(', ')}`] : []),
    ]),
  ];
  return lines.join('\n');
}

function descriptionContent(f: BriefInputFacts): string {
  const parts = [`Title: ${sanitizeInline(f.title)}`];
  if (f.description && f.description.trim()) parts.push(`Description:\n${sanitizeUntrusted(f.description.trim())}`);
  if (f.issue) {
    parts.push(
      `Linked issue #${f.issue.number}: ${sanitizeInline(f.issue.title)}${f.issue.body ? `\n${sanitizeUntrusted(f.issue.body.trim())}` : ''}`,
    );
  }
  return parts.join('\n\n');
}

function fileLine(f: BriefInputFile): string {
  return `- ${sanitizeInline(f.path)} [${sanitizeInline(f.role)}] +${f.additions}/-${f.deletions}; changed head-side lines: ${formatRanges(f.ranges)}`;
}

const HEADINGS: Record<BriefSource, string> = {
  intent: '## PR intent',
  blast: '## Blast radius',
  diff_stats: '## Changed files (statistics and changed line ranges; no code)',
  description: '## Description and linked issue',
  specs: '## Project specifications',
};

const wrapBlock = (label: string) => (content: string) => wrapUntrusted(label, content);

export function buildBriefInput(params: { facts: BriefInputFacts; tokenizer: Tokenizer }): BriefInputResult {
  const { facts, tokenizer } = params;
  const system = SYSTEM_PROMPT;

  const intentRaw = intentContent(facts.intent);
  const blastRaw = blastContent(facts.blast);
  const descRaw = descriptionContent(facts);

  const renderers: Record<BriefSource, (cap: number) => Rendered & { included?: string[]; omitted?: string[] }> = {
    intent: (cap) => fitText(intentRaw, cap, tokenizer, wrapBlock('pr-intent')),
    blast: (cap) => fitText(blastRaw, cap, tokenizer, wrapBlock('blast-radius')),
    description: (cap) => fitText(descRaw, cap, tokenizer, wrapBlock('pr-description')),
    diff_stats: (cap) =>
      fitItems(facts.files, cap, tokenizer, (kept) => (kept.length === 0 ? '' : wrapUntrusted('changed-files', kept.map(fileLine).join('\n')))),
    specs: (cap) => {
      const included: string[] = [];
      const omitted: string[] = [];
      const blocks: string[] = [];
      let used = 0;
      let stop = false;
      for (const doc of facts.specs) {
        if (stop) {
          omitted.push(doc.path);
          continue;
        }
        const content = sanitizeUntrusted(doc.content);
        const render = (c: string) => renderProjectDocBlock({ path: doc.path, content: c });
        const remaining = cap - used;
        const fit = fitText(content, remaining, tokenizer, render);
        if (fit.text === '') {
          omitted.push(doc.path);
          stop = true;
          continue;
        }
        blocks.push(fit.text);
        used += tokenizer.count(fit.text);
        included.push(doc.path);
        if (fit.itemsOmitted > 0) stop = true;
      }
      return { text: blocks.join('\n\n'), itemsOmitted: omitted.length, included, omitted };
    },
  };

  const order: BriefSource[] = ['intent', 'blast', 'diff_stats', 'description', 'specs'];
  const rendered = {} as Record<BriefSource, Rendered & { included?: string[]; omitted?: string[] }>;
  const tokens = {} as Record<BriefSource, number>;
  const reductions = new Map<BriefSource, BriefReduction>();

  const uncappedTokens = (s: BriefSource) => {
    const r = renderers[s](Number.POSITIVE_INFINITY);
    return { r, t: r.text === '' ? 0 : tokenizer.count(r.text) };
  };

  const assemble = (): string => {
    const sections = order
      .filter((s) => rendered[s].text !== '')
      .map((s) => `${HEADINGS[s]}\n${rendered[s].text}`);
    return [TASK, ...sections].join('\n\n');
  };
  const total = (): number => tokenizer.count(system) + tokenizer.count(assemble());

  const note = (s: BriefSource, before: number, after: number, r: Rendered) => {
    const prev = reductions.get(s);
    reductions.set(s, {
      source: s,
      tokens_before: prev ? prev.tokens_before : before,
      tokens_after: after,
      items_omitted: r.itemsOmitted,
    });
  };

  // 1. per-source shares
  for (const s of order) {
    const { r, t } = uncappedTokens(s);
    if (t > BRIEF_SHARES[s]) {
      const cut = renderers[s](BRIEF_SHARES[s]);
      rendered[s] = cut;
      tokens[s] = cut.text === '' ? 0 : tokenizer.count(cut.text);
      note(s, t, tokens[s], cut);
    } else {
      rendered[s] = r;
      tokens[s] = t;
    }
  }

  // 2. total budget: tighten in the fixed reduction order
  for (const s of BRIEF_REDUCTION_ORDER) {
    for (let attempt = 0; attempt < 3 && total() > BRIEF_INPUT_BUDGET && tokens[s] > 0; attempt++) {
      const excess = total() - BRIEF_INPUT_BUDGET;
      const before = tokens[s];
      const cut = renderers[s](Math.max(0, before - excess));
      rendered[s] = cut;
      tokens[s] = cut.text === '' ? 0 : tokenizer.count(cut.text);
      note(s, before, tokens[s], cut);
    }
  }

  const tokensTotal = total();
  if (tokensTotal > BRIEF_INPUT_BUDGET) return { ok: false, reason: 'budget', tokensTotal };

  const specsInfo = rendered.specs;
  const specsIncluded = specsInfo.included ?? [];
  const specsOmitted = specsInfo.omitted ?? [];
  const tokensBySource: Record<string, number> = { system: tokenizer.count(system) };
  for (const s of order) tokensBySource[s] = tokens[s];

  return {
    ok: true,
    system,
    user: assemble(),
    tokensTotal,
    tokensBySource,
    reductions: [...reductions.values()],
    specsIncluded,
    specsOmitted,
  };
}
