import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.0021, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", skills_tokens: 2, skill_blocks: [], memory: null, specs: null, project_specs: null, project_context_tokens: 0, project_specs_tokens: 0, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  project_context: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// Swappable per test (e.g. a pre-feature trace with no stats.cost_usd).
let currentTrace: RunTrace = TRACE;
let currentLiveRunning = false;
vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: currentTrace, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: currentLiveRunning }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  currentTrace = TRACE;
  currentLiveRunning = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("shows the run cost tile", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.0021")).toBeInTheDocument();
  });

  it("an older trace without cost shows — in the cost tile, never $0.00", () => {
    const { cost_usd: _omit, ...legacyStats } = TRACE.stats;
    currentTrace = { ...TRACE, stats: legacyStats };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("opens on the live log while a run is still running", () => {
    currentLiveRunning = true;
    renderWithIntl(
      <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} running onClose={() => {}} />,
    );
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("shows the derived PR intent prompt block when the trace has one", () => {
    currentTrace = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, intent: "Confidence: high (0.85) — …" } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("PR intent — derived (untrusted, dynamic)")).toBeInTheDocument();
  });

  it("hides the PR intent prompt block on a trace without one", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("PR intent — derived (untrusted, dynamic)")).not.toBeInTheDocument();
  });

  it("shows both project blocks, read specs and skipped docs with their reason", () => {
    currentTrace = {
      ...TRACE,
      prompt_assembly: {
        ...TRACE.prompt_assembly,
        specs: '<untrusted source="project-doc:docs/a.md">agent doc</untrusted>',
        project_specs: '<untrusted source="project-doc:specs/b.md">skill doc</untrusted>',
      },
      specs_read: ["docs/a.md", "specs/b.md"],
      project_context: [
        { path: "docs/a.md", section: "project_context", source: "agent", order: 0, tokens: 10, status: "injected" },
        { path: "docs/gone.md", section: "project_context", source: "agent", order: 1, tokens: 0, status: "skipped", reason: "missing" },
      ],
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("specs/b.md")).toBeInTheDocument();
    expect(screen.getByText("docs/gone.md — skipped (missing)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(screen.getByText("Project specifications — skill specs (untrusted)")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("expand")[2]!);
    expect(screen.getByText(/project-doc:docs\/a\.md/)).toBeInTheDocument();
  });

  it("an older trace without project_context renders 'none' and no project blocks", () => {
    const { project_context: _omit, ...legacy } = TRACE;
    currentTrace = legacy as unknown as RunTrace;
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("none")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Project specifications — skill specs (untrusted)")).not.toBeInTheDocument();
  });
});
