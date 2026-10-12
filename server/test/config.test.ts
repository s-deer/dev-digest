import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

describe('loadConfig', () => {
  it('binds the API to loopback by default', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.apiHost).toBe('127.0.0.1');
  });

  it('allows an explicit API host for trusted deployments', () => {
    const config = loadConfig({ NODE_ENV: 'test', API_HOST: '0.0.0.0' });
    expect(config.apiHost).toBe('0.0.0.0');
  });

  it('defaults the Project Context patterns to the spec pattern', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).projectContextPatterns).toEqual([
      '**/{specs,docs,insights}/**/*.md',
    ]);
  });

  it('parses ;-separated PROJECT_CONTEXT_PATTERNS (globs contain commas)', () => {
    expect(
      loadConfig({ NODE_ENV: 'test', PROJECT_CONTEXT_PATTERNS: 'a/**/*.md; b/*.md;' }).projectContextPatterns,
    ).toEqual(['a/**/*.md', 'b/*.md']);
    expect(
      loadConfig({ NODE_ENV: 'test', PROJECT_CONTEXT_PATTERNS: '  ' }).projectContextPatterns,
    ).toEqual(['**/{specs,docs,insights}/**/*.md']);
  });
});
