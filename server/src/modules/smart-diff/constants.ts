import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff (L03) classifier constants. `ROLE_ORDER` is the group display
 * order only; the classification check order lives in `CLASSIFICATION_RULES`
 * (boilerplate → tests → wiring → docs, with `core` as the fallback). See
 * `tasks/smart-diff/homework.md` "Starter classification patterns".
 */
export const ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export interface ClassificationRule {
  role: SmartDiffRole;
  label: string;
  patterns: RegExp[];
}

/**
 * Ordered top-down: the first rule whose pattern matches wins. This order is
 * NOT `ROLE_ORDER` — it is boilerplate, then tests, then wiring, then docs,
 * because a path can match more than one role's patterns and the more
 * specific rule must win. Concretely: the wiring glob for `.claude` dirs must
 * be checked before the docs glob for markdown files, so
 * `.claude/skills/security/SKILL.md` lands in `wiring`; and the boilerplate
 * glob for snapshot dirs must be checked before the tests glob for test
 * files, so a snapshot inside a `__tests__` dir lands in `boilerplate`.
 */
export const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    role: 'boilerplate',
    label: 'lock files, dist/build output, snapshots, generated and minified files',
    patterns: [
      /\.lock$/,
      /(^|\/)pnpm-lock\.yaml$/,
      /(^|\/)package-lock\.json$/,
      /(^|\/)yarn\.lock$/,
      /(^|\/)dist\//,
      /(^|\/)build\//,
      /(^|\/)__snapshots__\//,
      /\.snap$/,
      /\.generated\./,
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    label: 'test files and test directories',
    patterns: [
      /\.test\.tsx?$/,
      /\.spec\.ts$/,
      /(^|\/)test\//,
      /(^|\/)tests\//,
      /(^|\/)__tests__\//,
      /(^|\/)e2e\//,
    ],
  },
  {
    role: 'wiring',
    label: 'barrel files, config and CI/agent wiring',
    patterns: [
      /(^|\/)index\.(ts|js)$/,
      /\.config\.[^/]+$/,
      /(^|\/)tsconfig[^/]*\.json$/,
      /(^|\/)\.eslintrc[^/]*$/,
      /(^|\/)\.env[^/]*$/,
      /(^|\/)docker-compose[^/]*\.yml$/,
      /(^|\/)\.github\//,
      /(^|\/)\.claude\//,
    ],
  },
  {
    role: 'docs',
    label: 'markdown docs and readmes',
    patterns: [/\.md$/, /(^|\/)docs\//, /(^|\/)README[^/]*$/, /(^|\/)CHANGELOG[^/]*$/, /(^|\/)LICENSE$/],
  },
];
