import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionSkillDraft,
} from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from './repository.js';
import {
  CATEGORY_ORDER,
  MAX_FILE_CHARS,
  MAX_FILE_LINES,
  MAX_SAMPLE_CHARS,
  MAX_SNIPPET_LINES,
  MIN_SNIPPET_CHARS,
} from './constants.js';

export interface SampledFile {
  path: string;
  content: string;
  lines: string[];
  kind: 'config' | 'source';
  truncated: boolean;
}

export function toSampledFile(path: string, content: string, kind: SampledFile['kind']): SampledFile {
  const byChars = content.length > MAX_FILE_CHARS ? content.slice(0, MAX_FILE_CHARS) : content;
  const allLines = byChars.split('\n');
  const lines = allLines.slice(0, MAX_FILE_LINES);
  return {
    path,
    content: lines.join('\n'),
    lines,
    kind,
    truncated: lines.length < allLines.length || byChars.length < content.length,
  };
}

export function renderSample(files: SampledFile[]): { text: string; included: string[] } {
  const blocks: string[] = [];
  const included: string[] = [];
  let used = 0;
  for (const file of files) {
    const numbered = file.lines.map((line, index) => `${index + 1}\t${line}`).join('\n');
    const block = `--- FILE: ${file.path} ---\n${numbered}${file.truncated ? '\n... (truncated)' : ''}`;
    const nextSize = used === 0 ? block.length : used + 2 + block.length;
    if (nextSize > MAX_SAMPLE_CHARS) break;
    blocks.push(block);
    included.push(file.path);
    used = nextSize;
  }
  return { text: blocks.join('\n\n'), included };
}

export interface RawCandidate {
  rule: string;
  rationale?: string | null;
  evidence_path: string;
  evidence_line?: number | null;
  evidence_snippet: string;
  category?: string;
  confidence?: number;
}

export interface VerifiedCandidate {
  rule: string;
  rationale: string | null;
  category: ConventionCategory;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export type DropReason = 'unknown_path' | 'ambiguous_path' | 'snippet_too_short' | 'snippet_not_found';
export type VerifyResult =
  | { ok: true; candidate: VerifiedCandidate }
  | { ok: false; reason: DropReason };

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function pathMatches(files: Map<string, SampledFile>, citedPath: string):
  | { file: SampledFile }
  | { reason: 'unknown_path' | 'ambiguous_path' } {
  const clean = citedPath.trim().replace(/^\.\//, '');
  const exact = files.get(clean);
  if (exact) return { file: exact };
  const matches = [...files.values()].filter((file) => file.path.endsWith(`/${clean}`) || file.path === clean);
  if (matches.length === 1) return { file: matches[0]! };
  return { reason: matches.length === 0 ? 'unknown_path' : 'ambiguous_path' };
}

export function verifyCandidate(files: Map<string, SampledFile>, raw: RawCandidate): VerifyResult {
  const resolved = pathMatches(files, raw.evidence_path);
  if (!('file' in resolved)) return { ok: false, reason: resolved.reason };
  const file = resolved.file;
  const snippetLines = raw.evidence_snippet
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\t/, ''))
    .filter((line) => line.trim());
  const firstLine = snippetLines[0] ?? '';
  if (normalize(firstLine).length < MIN_SNIPPET_CHARS) {
    return { ok: false, reason: 'snippet_too_short' };
  }

  const normalizedSnippet = normalize(snippetLines.join('\n'));
  const candidates: number[] = [];
  file.lines.forEach((line, index) => {
    if (normalize(line).includes(normalize(firstLine))) candidates.push(index);
  });
  if (candidates.length === 0 || !normalize(file.content).includes(normalizedSnippet)) {
    return { ok: false, reason: 'snippet_not_found' };
  }
  const claimed = raw.evidence_line == null ? candidates[0]! : raw.evidence_line - 1;
  const lineIndex = candidates.reduce((best, current) =>
    Math.abs(current - claimed) < Math.abs(best - claimed) ? current : best,
  );
  const span = Math.min(Math.max(snippetLines.length, 1), MAX_SNIPPET_LINES);
  const selected = file.lines.slice(lineIndex, lineIndex + span);
  const indent = Math.min(
    ...selected.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length ?? 0),
  );
  const snippet = selected.map((line) => line.slice(indent)).join('\n').trimEnd();
  const categories = new Set<ConventionCategory>(CATEGORY_ORDER);
  return {
    ok: true,
    candidate: {
      rule: raw.rule.trim(),
      rationale: raw.rationale?.trim() || null,
      category: categories.has(raw.category as ConventionCategory)
        ? (raw.category as ConventionCategory)
        : 'general',
      evidencePath: file.path,
      evidenceLine: lineIndex + 1,
      evidenceSnippet: snippet,
      confidence: Math.max(0, Math.min(1, raw.confidence ?? 0)),
    },
  };
}

export function normalizeRule(rule: string): string {
  return rule.toLowerCase().replace(/[\s`'"*_.-]+/g, ' ').trim();
}

export function dedupe(candidates: VerifiedCandidate[], decidedRules: Iterable<string>): {
  kept: VerifiedCandidate[];
  dropped: number;
} {
  const seen = new Set([...decidedRules].map(normalizeRule));
  const kept: VerifiedCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeRule(candidate.rule);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(candidate);
  }
  return { kept, dropped: candidates.length - kept.length };
}

export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId,
    scan_id: row.scanId,
    category: row.category as ConventionCategory,
    rule: row.rule,
    rationale: row.rationale,
    evidence_path: row.evidencePath,
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet,
    confidence: row.confidence,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    sampled_files: row.sampledFiles,
    proposed: row.proposed,
    kept: row.kept,
    dropped_ungrounded: row.droppedUngrounded,
    dropped_duplicate: row.droppedDuplicate,
    cost_usd: row.costUsd == null ? null : Number(row.costUsd),
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

export function buildSkillDraft(
  repoFullName: string,
  accepted: ConventionRow[],
  existingSkill: { id: string; version: number } | null = null,
): ConventionSkillDraft {
  const grouped = new Map<string, ConventionRow[]>();
  for (const row of accepted) {
    const rows = grouped.get(row.category) ?? [];
    rows.push(row);
    grouped.set(row.category, rows);
  }
  const sections: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const rows = (grouped.get(category) ?? []).sort((a, b) => b.confidence - a.confidence);
    if (rows.length === 0) continue;
    sections.push(`## ${category[0]!.toUpperCase()}${category.slice(1)}`);
    for (const row of rows) {
      sections.push(
        `### ${row.rule}\n${row.rationale ?? ''}\n\nEvidence - \`${row.evidencePath}:${row.evidenceLine ?? 1}\`:\n\n\`\`\`\n${row.evidenceSnippet}\n\`\`\``,
      );
    }
  }
  return {
    name: 'repo-conventions',
    description: `Flag changes that break the house conventions of ${repoFullName}: ${[...grouped.keys()].join(', ')}.`,
    type: 'convention',
    enabled: true,
    body: [
      '# repo-conventions',
      '',
      `House conventions of ${repoFullName}, extracted from the code and approved by a maintainer.`,
      'Flag new code that violates a rule below; cite the offending file:line and the rule.',
      '',
      sections.join('\n\n'),
    ].join('\n'),
    convention_ids: accepted.map((row) => row.id),
    evidence_files: [...new Set(accepted.map((row) => row.evidencePath))],
    existing_skill: existingSkill,
  };
}
