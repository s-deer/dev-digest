/**
 * English-only model output for the server's own LLM calls (brief, intent,
 * conventions): each system prompt carries the rule, and each structured-output
 * schema rejects non-English prose — so the provider reprompts — while verbatim
 * evidence may stay in its original language.
 */
import { describe, it, expect } from 'vitest';
import { ENGLISH_ONLY_RULE } from '../src/platform/language.js';
import { BriefModelOutputEnglish, SYSTEM_PROMPT as BRIEF_SYSTEM } from '../src/modules/brief/prompt.js';
import { IntentExtractionEnglish, SYSTEM_PROMPT as INTENT_SYSTEM } from '../src/modules/intent/prompt.js';
import { ExtractionEnglish, SYSTEM_PROMPT as CONVENTIONS_SYSTEM } from '../src/modules/conventions/prompt.js';

const ZH = '空 catch 吞没所有同步错误';

function issuePaths(result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) {
  return (result.error?.issues ?? []).map((i) => i.path.join('.'));
}

describe('English-only model output (server LLM calls)', () => {
  it.each([
    ['brief', BRIEF_SYSTEM],
    ['intent', INTENT_SYSTEM],
    ['conventions', CONVENTIONS_SYSTEM],
  ])('%s system prompt ends with the English-only rule', (_name, system) => {
    expect(system.endsWith(ENGLISH_ONLY_RULE)).toBe(true);
  });

  it('brief: rejects non-English summary, risk text and focus reasons', () => {
    const output = {
      summary: ZH,
      risks: [
        { file_refs: ['src/a.ts'], line: null, explanation: ZH, title: 'Swallowed errors', kind: 'other', severity: 'high' },
      ],
      review_focus: [{ file: 'src/a.ts', line: 3, reason: ZH }],
    };
    const res = BriefModelOutputEnglish.safeParse(output);
    expect(res.success).toBe(false);
    expect(issuePaths(res)).toEqual(['summary', 'risks.0.explanation', 'review_focus.0.reason']);

    const english = { ...output, summary: 'Adds a sync scheduler.', risks: [], review_focus: [] };
    expect(BriefModelOutputEnglish.safeParse(english).success).toBe(true);
  });

  it('intent: rejects non-English intent and scope, keeps verbatim evidence in any language', () => {
    const output = {
      evidence: [{ source_ref: 'issue #12', quote: 'Нужно отключать планировщик синхронизации' }],
      intent: 'Let operators disable the repo sync scheduler.',
      in_scope: [ZH],
      out_of_scope: [],
      change_type: 'feature',
      self_confidence: 'medium',
    };
    const res = IntentExtractionEnglish.safeParse(output);
    expect(issuePaths(res)).toEqual(['in_scope.0']);
    expect(IntentExtractionEnglish.safeParse({ ...output, in_scope: ['Scheduler toggle'] }).success).toBe(true);
  });

  it('conventions: rejects non-English rule and rationale, keeps the code snippet verbatim', () => {
    const candidate = {
      rule: 'Log and rethrow errors in background jobs',
      rationale: 'Seen in two job handlers.',
      evidence_path: 'src/jobs/a.ts',
      evidence_line: 4,
      evidence_snippet: 'logger.error("同步失败", err)',
      occurrences: 2,
      category: 'errors',
      confidence: 0.8,
    };
    expect(ExtractionEnglish.safeParse({ candidates: [candidate] }).success).toBe(true);
    const res = ExtractionEnglish.safeParse({ candidates: [{ ...candidate, rule: ZH, rationale: ZH }] });
    expect(issuePaths(res)).toEqual(['candidates.0.rule', 'candidates.0.rationale']);
  });
});
