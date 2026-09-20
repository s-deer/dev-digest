import { z } from 'zod';
import { MAX_CANDIDATES } from './constants.js';

export const ExtractionSchema = z.object({
  candidates: z.array(
    z.object({
      rule: z.string(),
      rationale: z.string(),
      evidence_path: z.string(),
      evidence_line: z.number().int(),
      evidence_snippet: z.string(),
      occurrences: z.number().int(),
      category: z.enum(['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general']),
      confidence: z.number(),
    }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const SYSTEM_PROMPT = `You extract this repository's house conventions: specific repeated rules a reviewer should enforce in new code.

You receive a code-selected sample. Files are listed with 1-based line numbers. Cite only files in the sample and copy evidence verbatim.

Return rules that are specific to this repository and visible in at least two places, or stated explicitly by a configuration file. Rules must be imperative, concise, and checkable from a pull-request diff.

Do not return universal advice, framework defaults, a single trivial line, or anything without evidence. An ungrounded candidate is discarded by code.

Categories: naming, structure, errors, testing, imports, typing, api, general.
Count occurrences in the sample before assigning confidence: 0.9+ for explicit or pervasive rules, 0.7-0.9 for repeated rules, 0.5-0.7 for plausible rules seen once or twice. Return at most ${MAX_CANDIDATES} candidates, strongest first.`;

export function buildUserMessage(repoFullName: string, sample: string, paths: string[]): string {
  return [
    `Repository: ${repoFullName}`,
    '',
    `Sampled files (${paths.length}) - cite only these files:`,
    paths.map((path) => `- ${path}`).join('\n'),
    '',
    'SAMPLE',
    sample,
  ].join('\n');
}
