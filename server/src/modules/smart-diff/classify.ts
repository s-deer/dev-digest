import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFICATION_RULES } from './constants.js';

/**
 * Pure path → role classifier (Smart Diff, L03). No framework or DB imports —
 * `modules/smart-diff/routes.ts` calls this, but so will the L08 prompt
 * filter, without an HTTP request. Normalises `\` to `/` first so a path
 * captured on Windows still matches the `/`-anchored patterns in
 * `CLASSIFICATION_RULES`.
 */
export function classifyFile(path: string): SmartDiffRole {
  const normalised = path.replace(/\\/g, '/');
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalised))) return rule.role;
  }
  return 'core';
}
