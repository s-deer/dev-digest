import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/classify.js';

/**
 * "path → role" table for the Smart Diff classifier. Order matches
 * `tasks/smart-diff/homework.md` "Starter classification patterns": every
 * pattern gets at least one case, plus the three disputed cases pinned as
 * test comments below.
 */
const CASES: [path: string, role: SmartDiffRole][] = [
  // ---- boilerplate ----
  ['Cargo.lock', 'boilerplate'], // *.lock
  ['pnpm-lock.yaml', 'boilerplate'], // pnpm-lock.yaml
  ['package-lock.json', 'boilerplate'], // package-lock.json
  ['yarn.lock', 'boilerplate'], // yarn.lock
  ['dist/bundle.js', 'boilerplate'], // dist/**
  ['apps/web/dist/bundle.js', 'boilerplate'], // dist/** nested
  ['build/output.js', 'boilerplate'], // build/**
  ['src/components/__snapshots__/Button.shot', 'boilerplate'], // **/__snapshots__/**
  ['src/foo.snap', 'boilerplate'], // *.snap
  ['src/types.generated.ts', 'boilerplate'], // *.generated.*
  ['vendor/jquery.min.js', 'boilerplate'], // *.min.js

  // ---- tests ----
  ['src/components/Button.test.tsx', 'tests'], // **/*.test.tsx
  ['src/utils/sum.test.ts', 'tests'], // **/*.test.ts
  ['server/test/reviews.it.test.ts', 'tests'], // **/*.it.test.ts
  ['src/foo.spec.ts', 'tests'], // **/*.spec.ts
  ['server/test/helpers/pg.ts', 'tests'], // **/test/**
  ['project/tests/fixture.json', 'tests'], // **/tests/**
  ['src/__tests__/util.ts', 'tests'], // **/__tests__/**
  ['e2e/specs/05-pr-diff.flow.json', 'tests'], // e2e/**

  // ---- wiring ----
  ['src/index.ts', 'wiring'], // index.ts
  ['src/index.js', 'wiring'], // index.js
  ['vitest.config.ts', 'wiring'], // *.config.*
  ['next.config.mjs', 'wiring'], // *.config.*
  ['tsconfig.json', 'wiring'], // tsconfig*.json
  ['tsconfig.build.json', 'wiring'], // tsconfig*.json
  ['.eslintrc.json', 'wiring'], // .eslintrc*
  ['.env.local', 'wiring'], // .env*
  ['docker-compose.yml', 'wiring'], // docker-compose*.yml
  ['docker-compose.override.yml', 'wiring'], // docker-compose*.yml
  ['.github/workflows/ci.yml', 'wiring'], // .github/**

  // ---- docs ----
  ['notes/design.md', 'docs'], // **/*.md
  ['docs/a.md', 'docs'], // docs/** (also required example)
  ['README.md', 'docs'], // README*
  ['CHANGELOG.md', 'docs'], // CHANGELOG*
  ['LICENSE', 'docs'], // LICENSE

  // ---- core (fallback) ----
  ['server/src/modules/reviews/service.ts', 'core'], // required example
  ['client/src/app/page.tsx', 'core'],

  // ---- disputed cases (order matters more than the patterns) ----
  // The snapshot rule (boilerplate) sits above the tests rule.
  ['src/__tests__/__snapshots__/x.snap', 'boilerplate'],
  // .claude/** (wiring) sits above **/*.md (docs) — markdown here defines
  // agent behaviour, not documentation.
  ['.claude/skills/security/SKILL.md', 'wiring'],
  // e2e/** (tests) sits above **/*.md (docs) — kept as the starter default;
  // an e2e README still reads as part of the test suite.
  ['e2e/README.md', 'tests'],

  // ---- Windows path separators normalise before matching ----
  ['src\\components\\Button.test.tsx', 'tests'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
