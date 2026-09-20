import { describe, expect, it } from 'vitest';
import {
  buildSkillDraft,
  dedupe,
  renderSample,
  toSampledFile,
  verifyCandidate,
  type RawCandidate,
} from '../src/modules/conventions/helpers.js';

const file = toSampledFile(
  'src/server.ts',
  ['import { z } from "zod";', '', 'export const PORT = 3000;', 'export const HOST = "localhost";'].join('\n'),
  'source',
);

function candidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    rule: 'Use named exports for server configuration.',
    rationale: 'Named exports make configuration dependencies explicit.',
    evidence_path: 'src/server.ts',
    evidence_line: 3,
    evidence_snippet: 'export const PORT = 3000;',
    category: 'structure',
    confidence: 0.9,
    ...overrides,
  };
}

describe('conventions helpers', () => {
  it('renders 1-based line gutters and truncates the whole sample by budget', () => {
    const rendered = renderSample([file]);
    expect(rendered.included).toEqual(['src/server.ts']);
    expect(rendered.text).toContain('1\timport { z } from "zod";');
    expect(rendered.text).toContain('3\texport const PORT = 3000;');
  });

  it('accepts exact and unique suffix paths, while rejecting ambiguous paths', () => {
    const files = new Map([
      [file.path, file],
      ['src/other/server.ts', toSampledFile('src/other/server.ts', 'export const PORT = 3000;', 'source')],
    ]);
    expect(verifyCandidate(files, candidate({ evidence_path: './src/server.ts' })).ok).toBe(true);
    expect(verifyCandidate(files, candidate({ evidence_path: 'server.ts' }))).toMatchObject({
      ok: false,
      reason: 'ambiguous_path',
    });
  });

  it('takes evidence from the file and corrects the nearest repeated-line location', () => {
    const repeated = toSampledFile('src/repeated.ts', 'const value = 1;\nconst value = 1;\nconst value = 2;', 'source');
    const result = verifyCandidate(
      new Map([[repeated.path, repeated]]),
      candidate({
        evidence_path: 'repeated.ts',
        evidence_line: 2,
        evidence_snippet: 'const value = 1;',
      }),
    );
    expect(result).toMatchObject({ ok: true, candidate: { evidenceLine: 2, evidenceSnippet: 'const value = 1;' } });
  });

  it('drops short or invented snippets and deduplicates decided rules', () => {
    const files = new Map([[file.path, file]]);
    expect(verifyCandidate(files, candidate({ evidence_snippet: '}' })).ok).toBe(false);
    expect(verifyCandidate(files, candidate({ evidence_snippet: 'not in file' }))).toMatchObject({
      ok: false,
      reason: 'snippet_not_found',
    });
    const first = verifyCandidate(files, candidate()).ok;
    expect(first).toBe(true);
    const verified = verifyCandidate(files, candidate());
    if (!verified.ok) throw new Error('expected a grounded candidate');
    expect(dedupe([verified.candidate], ['Use named exports for server configuration.']).dropped).toBe(1);
  });

  it('builds an ordered editable skill draft from accepted conventions', () => {
    const rows = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        repoId: 'repo',
        scanId: null,
        category: 'typing',
        rule: 'Prefer explicit return types.',
        rationale: 'Reviewers can verify boundaries.',
        evidencePath: 'src/server.ts',
        evidenceLine: 3,
        evidenceSnippet: 'export const PORT = 3000;',
        confidence: 0.8,
        status: 'accepted',
        workspaceId: 'workspace',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ] as never;
    const draft = buildSkillDraft('acme/payments-api', rows, {
      id: '00000000-0000-0000-0000-000000000002',
      version: 3,
    });
    expect(draft).toMatchObject({ name: 'repo-conventions', type: 'convention', enabled: true });
    expect(draft.description).toContain('acme/payments-api');
    expect(draft.body).toContain('## Typing');
    expect(draft.body).toContain('Evidence - `src/server.ts:3`');
    expect(draft.existing_skill?.version).toBe(3);
  });
});
