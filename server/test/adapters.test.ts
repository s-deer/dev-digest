import { describe, it, expect } from 'vitest';
import { Review } from '@devdigest/shared';
import {
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
} from '../src/adapters/mocks.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});

describe('mock adapter semantics for the Intent Layer', () => {
  it('MockGitClient.readFileAt returns the fixture keyed by ref:path, throws otherwise', async () => {
    const git = new MockGitClient({ filesAt: { 'abc1234:docs/plan.md': '# The plan' } });
    await expect(git.readFileAt({ owner: 'a', name: 'b' }, 'abc1234', 'docs/plan.md')).resolves.toBe(
      '# The plan',
    );
    await expect(git.readFileAt({ owner: 'a', name: 'b' }, 'abc1234', 'docs/missing.md')).rejects.toThrow();
  });

  it('MockGitHubClient.getIssue returns a fixture or throws when `issues` is configured, and counts calls', async () => {
    const gh = new MockGitHubClient({ issues: { 471: { number: 471, title: 'Bug', body: 'x', state: 'open' } } });
    await expect(gh.getIssue({ owner: 'a', name: 'b' }, 471)).resolves.toMatchObject({ number: 471 });
    await expect(gh.getIssue({ owner: 'a', name: 'b' }, 999)).rejects.toThrow();
    expect(gh.issueCalls).toEqual([471, 999]);
  });

  it('MockGitHubClient.getFileContent returns the fixture or null for a missing path, and counts calls', async () => {
    const gh = new MockGitHubClient({ contents: { 'docs/plan.md': '# The plan' } });
    await expect(gh.getFileContent({ owner: 'a', name: 'b' }, 'docs/plan.md', 'abc1234')).resolves.toBe(
      '# The plan',
    );
    await expect(gh.getFileContent({ owner: 'a', name: 'b' }, 'docs/missing.md', 'abc1234')).resolves.toBeNull();
    expect(gh.contentCalls).toEqual([
      { path: 'docs/plan.md', ref: 'abc1234' },
      { path: 'docs/missing.md', ref: 'abc1234' },
    ]);
  });
});
