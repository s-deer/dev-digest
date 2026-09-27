import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, summarizeSmartDiff } from '../src/modules/smart-diff/domain.js';

describe('buildSmartDiff', () => {
  it('groups in role order, omits empty groups, and keeps input order within a group', () => {
    const files = [
      { path: 'pnpm-lock.yaml', additions: 10, deletions: 0 }, // boilerplate
      { path: 'src/api/users.ts', additions: 7, deletions: 2 }, // core
      { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 }, // core
      { path: 'src/index.ts', additions: 1, deletions: 1 }, // wiring
    ];

    const result = buildSmartDiff(files, []);

    // core, wiring, boilerplate — tests and docs are empty and omitted.
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    const core = result.groups.find((g) => g.role === 'core')!;
    // src/api/users.ts before src/middleware/ratelimit.ts — input order preserved.
    expect(core.files.map((f) => f.path)).toEqual(['src/api/users.ts', 'src/middleware/ratelimit.ts']);
  });

  it('attaches sorted, unique finding_lines only to the matching file', () => {
    const files = [
      { path: 'src/config.ts', additions: 4, deletions: 0 },
      { path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ];
    const findings = [
      { file: 'src/config.ts', start_line: 12 },
      { file: 'src/config.ts', start_line: 5 },
      { file: 'src/config.ts', start_line: 12 }, // duplicate
      { file: 'src/api/users.ts', start_line: 45 },
    ];

    const result = buildSmartDiff(files, findings);
    const allFiles = result.groups.flatMap((g) => g.files);
    const config = allFiles.find((f) => f.path === 'src/config.ts')!;
    const users = allFiles.find((f) => f.path === 'src/api/users.ts')!;
    expect(config.finding_lines).toEqual([5, 12]);
    expect(users.finding_lines).toEqual([45]);
  });

  it('sums additions + deletions into total_lines, and the output passes SmartDiff.parse', () => {
    const files = [
      { path: 'src/config.ts', additions: 4, deletions: 1 },
      { path: 'README.md', additions: 2, deletions: 0 },
    ];
    const findings = [{ file: 'src/config.ts', start_line: 12 }];

    const result = buildSmartDiff(files, findings);
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 7, proposed_splits: [] });
    expect(() => SmartDiff.parse(result)).not.toThrow();
  });
});

describe('summarizeSmartDiff', () => {
  it('counts total files and groups, and only files that have finding_lines', () => {
    const files = [
      { path: 'src/config.ts', additions: 4, deletions: 0 },
      { path: 'src/api/users.ts', additions: 7, deletions: 2 },
      { path: 'README.md', additions: 2, deletions: 0 },
    ];
    const findings = [{ file: 'src/config.ts', start_line: 12 }];

    const smartDiff = buildSmartDiff(files, findings);
    // core (2 files, 1 with findings) + docs (1 file, none with findings).
    expect(summarizeSmartDiff(smartDiff)).toEqual({ files: 3, groups: 2, findingFiles: 1 });
  });

  it('is all zero for an empty smart diff', () => {
    expect(summarizeSmartDiff(buildSmartDiff([], []))).toEqual({ files: 0, groups: 0, findingFiles: 0 });
  });
});
