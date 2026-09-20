export const CONFIG_SAMPLE_PATHS = [
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'tsconfig.node.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.js',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'biome.json',
  '.editorconfig',
  'CONTRIBUTING.md',
  'AGENTS.md',
  'CLAUDE.md',
] as const;

export const SOURCE_SAMPLE_SIZE = 12;
export const MAX_FILE_LINES = 220;
export const MAX_FILE_CHARS = 12_000;
export const MAX_SAMPLE_CHARS = 90_000;
export const MAX_CANDIDATES = 12;
export const MIN_SNIPPET_CHARS = 8;
export const MAX_SNIPPET_LINES = 8;
export const EXTRACT_TEMPERATURE = 0.1;
export const EXTRACT_MAX_TOKENS = 4_000;
export const EXTRACT_TIMEOUT_MS = 120_000;
export const SKILL_NAME = 'repo-conventions';

export const CATEGORY_ORDER = [
  'naming',
  'structure',
  'errors',
  'testing',
  'imports',
  'typing',
  'api',
  'general',
] as const;
