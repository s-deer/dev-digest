import type { SmartDiff, SmartDiffFile, SmartDiffGroup } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { ROLE_ORDER } from './constants.js';

/** Minimal file shape `buildSmartDiff` needs — a `PrFile` row without `patch`. */
export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

/** Minimal finding shape `buildSmartDiff` needs — already filtered to the
 *  latest review's non-dismissed findings by the caller. */
export interface SmartDiffInputFinding {
  file: string;
  start_line: number;
}

/**
 * Pure grouping (Smart Diff, L03): classifies each file with `classifyFile`,
 * groups in `ROLE_ORDER` (empty groups omitted), keeps each group's files in
 * input order, and attaches the sorted, unique `finding_lines` for that file.
 * No LLM call, no I/O — `pseudocode_summary` and real split suggestions are
 * out of scope (see the plan's "Out of scope").
 */
export function buildSmartDiff(files: SmartDiffInputFile[], findings: SmartDiffInputFinding[]): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const finding of findings) {
    const lines = linesByFile.get(finding.file) ?? new Set<number>();
    lines.add(finding.start_line);
    linesByFile.set(finding.file, lines);
  }

  const filesByRole = new Map<string, SmartDiffFile[]>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const lines = linesByFile.get(file.path);
    const smartDiffFile: SmartDiffFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: lines ? [...lines].sort((a, b) => a - b) : [],
    };
    const group = filesByRole.get(role) ?? [];
    group.push(smartDiffFile);
    filesByRole.set(role, group);
  }

  const groups: SmartDiffGroup[] = ROLE_ORDER.filter((role) => (filesByRole.get(role) ?? []).length > 0).map(
    (role) => ({ role, files: filesByRole.get(role)! }),
  );

  const totalLines = files.reduce((sum, file) => sum + file.additions + file.deletions, 0);

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}

/** Counts for the route's `smart-diff: built` log line — pure so it has a
 *  hermetic test instead of only being exercised through the route. */
export function summarizeSmartDiff(smartDiff: SmartDiff): {
  files: number;
  groups: number;
  findingFiles: number;
} {
  const files = smartDiff.groups.reduce((sum, group) => sum + group.files.length, 0);
  const findingFiles = smartDiff.groups.reduce(
    (sum, group) => sum + group.files.filter((file) => file.finding_lines.length > 0).length,
    0,
  );
  return { files, groups: smartDiff.groups.length, findingFiles };
}
