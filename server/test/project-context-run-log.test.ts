import { describe, expect, it, vi } from 'vitest';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { RunBus } from '../src/platform/sse.js';
import { RunLogger } from '../src/platform/run-logger.js';

const SECRET = 'SECRET-DOC-BODY-do-not-log';

function record(over: Record<string, unknown>) {
  return { source: 'agent', order: 0, tokens: 10, status: 'injected', ...over };
}

describe('ReviewRunExecutor.logProjectContext (NFR-9)', () => {
  it('emits exactly one structured summary line per run and never document text', () => {
    const pino = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const runLog = new RunLogger(new RunBus(), ['run-1'], pino);
    const resolved = {
      contextDocs: [{ path: 'docs/a.md', content: SECRET, tokens: 10 }],
      specsDocs: [],
      records: [
        record({ path: 'docs/a.md', section: 'project_context' }),
        record({ path: 'docs/b.md', section: 'project_context', order: 1, tokens: 0, status: 'skipped', reason: 'over_budget' }),
        record({ path: 'specs/c.md', section: 'project_specifications', source: 'Arch', tokens: 0, status: 'skipped', reason: 'over_budget' }),
        record({ path: 'specs/d.md', section: 'project_specifications', source: 'Arch', order: 1, tokens: 0, status: 'skipped', reason: 'missing' }),
      ],
      injectedPaths: ['docs/a.md'],
      specsRead: ['docs/a.md'],
      tokens: { context: 10, specs: 0 },
    };

    (ReviewRunExecutor.prototype as any).logProjectContext.call(null, runLog, resolved);

    const calls = pino.info.mock.calls as [Record<string, unknown>, string][];
    const withData = calls.filter(([obj]) => 'data' in obj);
    expect(withData).toHaveLength(1);
    expect(withData[0]![1]).toBe('project context summary');
    expect(withData[0]![0].data).toEqual({
      event: 'project_context_summary',
      sections: {
        project_context: { attached: 2, injected: 1, skipped: 1, tokens: 10 },
        project_specifications: { attached: 2, injected: 0, skipped: 2, tokens: 0 },
      },
      skipReasons: { over_budget: 2, missing: 1 },
    });
    // per-doc live-log lines are still emitted (AC-42)
    expect(calls.some(([, msg]) => msg.includes('docs/a.md'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain(SECRET);
  });

  it('emits nothing when no documents are attached', () => {
    const pino = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const runLog = new RunLogger(new RunBus(), ['run-1'], pino);
    (ReviewRunExecutor.prototype as any).logProjectContext.call(null, runLog, { records: [], tokens: { context: 0, specs: 0 } });
    expect(pino.info).not.toHaveBeenCalled();
  });
});
