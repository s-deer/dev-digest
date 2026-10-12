/**
 * English-only output — the prose detector, the schema refinement that drives
 * the provider's reprompt loop, and the rule in every assembled system prompt.
 */
import { describe, it, expect } from 'vitest';
import { Review } from '@devdigest/shared';
import { ENGLISH_ONLY_RULE, isNonEnglishProse, requireEnglish } from '../src/language.js';
import { parseWithRepair, toJsonSchema } from '../src/llm/structured.js';
import { assemblePrompt } from '../src/prompt.js';

describe('isNonEnglishProse', () => {
  it.each([
    ['Chinese prose (the real regression)', '发生严重缺陷：`REPO_SYNC_ENABLED=false` 无法禁用调度器', true],
    ['mixed Chinese title with identifiers', 'sync-scheduler 中空 catch 吞没所有错误', true],
    ['Russian prose', 'Пустой catch проглатывает все ошибки синхронизации', true],
    ['English prose', 'Empty catch swallows every sync error', false],
    ['English with accented Latin words', 'Rename the café résumé helper', false],
    ['English quoting a short foreign label', 'The "确认提交" label is hardcoded instead of using i18n', false],
    ['English with foreign text in inline code', 'Replace `throw new Error("无法禁用调度器")` with a typed error', false],
    ['English with a fenced code block', 'Use the message key:\n```ts\nt("ошибка синхронизации репозитория")\n```', false],
    ['two stray foreign letters', 'Use 中文 docs', false],
    ['no letters', '42 → 61', false],
  ])('%s', (_name, text, expected) => {
    expect(isNonEnglishProse(text)).toBe(expected);
  });
});

describe('requireEnglish', () => {
  const schema = requireEnglish(Review, (r) => [
    [['summary'], r.summary],
    ...r.findings.map((f, i) => [['findings', i, 'title'], f.title] as const),
  ]);
  const review = (summary: string, title: string) =>
    JSON.stringify({
      verdict: 'comment',
      summary,
      score: 70,
      findings: [
        {
          id: 'f1',
          severity: 'WARNING',
          category: 'bug',
          title,
          file: 'src/a.ts',
          start_line: 1,
          end_line: 1,
          rationale: 'r',
          suggestion: null,
          confidence: 0.8,
        },
      ],
    });

  it('sends the same JSON Schema to the provider as the plain contract', () => {
    expect(toJsonSchema(schema, 'Review')).toEqual(toJsonSchema(Review, 'Review'));
  });

  it('accepts English prose', () => {
    expect(parseWithRepair(schema, review('Looks fine.', 'Missing null check')).ok).toBe(true);
  });

  it('rejects a non-English field with a reprompt that names the field and asks for English', () => {
    const res = parseWithRepair(schema, review('Looks fine.', '空 catch 吞没所有错误和异常'));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.repromptMessage).toContain('findings.0.title');
    expect(res.repromptMessage).toContain('must be written in English');
    expect(res.repromptMessage).not.toContain('- summary');
  });
});

describe('assemblePrompt — English-only rule', () => {
  it('appends the rule to every agent system prompt, after the injection guard', () => {
    const system = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF' }).messages[0]!.content;
    expect(system.endsWith(ENGLISH_ONLY_RULE)).toBe(true);
    expect(system.indexOf('SECURITY')).toBeLessThan(system.indexOf('LANGUAGE'));
  });
});
