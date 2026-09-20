import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { IMPORT_LIMITS, parseSkillUpload, splitFrontmatter } from '../src/modules/skills/importer.js';
import { ValidationError } from '../src/platform/errors.js';

const SKILL = '---\nname: boundary-cases\ndescription: >\n  Flag missing tests\n  for limits.\ntype: rubric\n---\n# Boundaries\nTest 0, 1, and max.';

describe('skill importer', () => {
  it('reads frontmatter (including folded scalars) from a .md upload', () => {
    const preview = parseSkillUpload('boundary.md', strToU8(`﻿${SKILL}`));
    expect(preview).toEqual({
      name: 'boundary-cases',
      description: 'Flag missing tests for limits.',
      type: 'rubric',
      body: '# Boundaries\nTest 0, 1, and max.',
      source_file: 'boundary.md',
      ignored_files: [],
      warnings: [],
    });
  });

  it('falls back to the first H1 and the custom type without frontmatter', () => {
    const preview = parseSkillUpload('x.md', strToU8('# Flaky tests\nNo sleeps.'));
    expect(preview).toMatchObject({ name: 'Flaky tests', description: '', type: 'custom' });
  });

  it('picks the root SKILL.md over other Markdown and lists everything else as ignored', () => {
    const archive = zipSync({
      'SKILL.md': strToU8(SKILL),
      'README.md': strToU8('# Readme'),
      'scripts/install.py': strToU8('import os'),
      '__MACOSX/._SKILL.md': strToU8('junk'),
    });
    const preview = parseSkillUpload('skill.zip', archive);
    expect(preview.source_file).toBe('SKILL.md');
    expect(preview.ignored_files).toEqual(['README.md', 'scripts/install.py']);
    expect(preview.warnings).toHaveLength(1);
  });

  it('accepts a single nested SKILL.md and names the skill after its folder when frontmatter has no name', () => {
    const archive = zipSync({ 'over-mocking/SKILL.md': strToU8('Mock only the boundary.') });
    expect(parseSkillUpload('pack.zip', archive)).toMatchObject({ name: 'over-mocking', source_file: 'over-mocking/SKILL.md' });
  });

  it('rejects archives without a skill core, with several cores, or that are not zips', () => {
    expect(() => parseSkillUpload('a.zip', zipSync({ 'run.sh': strToU8('echo') }))).toThrow(/No skill core/);
    expect(() =>
      parseSkillUpload('a.zip', zipSync({ 'a/SKILL.md': strToU8('a'), 'b/SKILL.md': strToU8('b') })),
    ).toThrow(/several SKILL.md/);
    expect(() => parseSkillUpload('a.zip', strToU8('not a zip'))).toThrow(ValidationError);
    expect(() => parseSkillUpload('a.tar', strToU8('x'))).toThrow(/Unsupported file type/);
  });

  it('enforces the entry-count and unpacked-size limits before inflating', () => {
    const many = Object.fromEntries(
      Array.from({ length: IMPORT_LIMITS.entries + 1 }, (_, i) => [`f${i}.txt`, strToU8('x')]),
    );
    expect(() => parseSkillUpload('many.zip', zipSync(many))).toThrow(/more than/);
    const bomb = zipSync({ 'SKILL.md': new Uint8Array(IMPORT_LIMITS.unpackedBytes + 1) }, { level: 9 });
    expect(bomb.byteLength).toBeLessThan(IMPORT_LIMITS.uploadBytes);
    expect(() => parseSkillUpload('bomb.zip', bomb)).toThrow(/unpacks to more than/);
  });

  it('rejects an empty body and non-UTF-8 text', () => {
    expect(() => parseSkillUpload('x.md', strToU8('---\nname: x\n---\n  '))).toThrow(/no skill body/);
    expect(() => parseSkillUpload('x.md', new Uint8Array([0xff, 0xfe, 0xfd]))).toThrow(/UTF-8/);
  });

  it('leaves text without frontmatter untouched', () => {
    expect(splitFrontmatter('# Title\n---\nbody')).toEqual({ meta: {}, body: '# Title\n---\nbody' });
  });
});
