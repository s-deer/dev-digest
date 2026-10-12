import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { BriefCard } from "./BriefCard";

const BRIEF: PrBriefRecord = {
  summary: "Adds rate limiting to webhooks so abusive senders get throttled.",
  risks: [
    {
      file_refs: ["src/limiter.ts", "src/server.ts"],
      explanation: "Limiter state is in memory only.",
      title: "In-memory limiter",
      kind: "scalability",
      severity: "high",
    },
  ],
  review_focus: [{ file: "src/limiter.ts", line: 42, reason: "bucket refill math" }],
  head_sha: "abc",
  generated_at: "2026-01-01T00:00:00.000Z",
  provider: "openai",
  model: "gpt-4.1",
  usage: { tokens_in: 1, tokens_out: 1, cost_usd: null, attempts: 1, input_tokens_total: 1, input_tokens_by_source: {} },
  reductions: [],
  facts: {
    intent: "present",
    blast: { status: "present" },
    linked_issue: "present",
    description: "present",
    specs: { status: "none_attached", agent: null, included_paths: [], omitted_paths: [] },
  },
  grounding: { risks_dropped: 0, risk_refs_removed: 0, focus_dropped: 0, focus_lines_snapped: 0 },
};

const hooks = vi.hoisted(() => ({
  data: undefined as PrBriefResponse | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
  generateIsError: false,
}));

const intentHooks = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({
    data: hooks.data,
    isLoading: hooks.isLoading,
    isError: hooks.isError,
    refetch: hooks.refetch,
  }),
  useGenerateBrief: () => ({
    mutate: hooks.mutate,
    isPending: hooks.isPending,
    isError: hooks.generateIsError,
  }),
}));

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({
    data: null,
    isLoading: intentHooks.isLoading,
    isError: intentHooks.isError,
    refetch: intentHooks.refetch,
  }),
  useGenerateIntent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("../BlastRadiusCard", () => ({
  BlastRadiusCard: () => <div>Blast radius</div>,
}));

const onOpenFile = vi.fn();

function review(over: Partial<ReviewRecord> & { id: string; created_at: string }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    findings: [],
    ...over,
  };
}

function renderCard(prId: string | null = "pr1", reviews?: ReviewRecord[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages, prReview, common }}>
      <BriefCard
        prId={prId}
        repoId="r1"
        repoFullName="o/r"
        headSha="abc"
        reviews={reviews}
        onOpenFile={onOpenFile}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  hooks.data = undefined;
  hooks.isLoading = false;
  hooks.isError = false;
  hooks.isPending = false;
  hooks.generateIsError = false;
  hooks.refetch.mockClear();
  intentHooks.isLoading = false;
  intentHooks.isError = false;
  intentHooks.refetch.mockClear();
  hooks.mutate.mockClear();
  onOpenFile.mockClear();
});
afterEach(cleanup);

describe("BriefCard", () => {
  it("shows the empty state once with Intent and Blast below, a skeleton while generating, then the ordered block", () => {
    hooks.data = { brief: null, stale: false };
    renderCard();
    expect(screen.getAllByText("No brief yet")).toHaveLength(1);
    expect(screen.getByText("No intent yet")).toBeInTheDocument();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(hooks.mutate).toHaveBeenCalledTimes(1);

    cleanup();
    hooks.isPending = true;
    renderCard();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    expect(screen.queryByText("No brief yet")).not.toBeInTheDocument();

    cleanup();
    hooks.isPending = false;
    hooks.data = { brief: BRIEF, stale: false };
    renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByText("In-memory limiter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High: In-memory limiter" })).toBeInTheDocument();
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    expect(screen.getAllByText("Risk areas")).toHaveLength(1);
    expect(screen.getAllByText("Review focus — read these first")).toHaveLength(1);
    expect(screen.getByText("Generated without: no specs attached")).toBeInTheDocument();
    // banner -> grid -> focus -> notes
    const summary = screen.getByText(BRIEF.summary);
    const risks = screen.getByText("Risk areas");
    const focus = screen.getByText("Review focus — read these first");
    const note = screen.getByText("Generated without: no specs attached");
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(summary, risks)).toBe(true);
    expect(before(risks, focus)).toBe(true);
    expect(before(focus, note)).toBe(true);
  });

  it("refresh in flight keeps the summary with a disabled refresh button and a spinner", () => {
    hooks.data = { brief: BRIEF, stale: false };
    hooks.isPending = true;
    renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-run the brief for this PR" })).toBeDisabled();
    expect(screen.getByRole("img", { name: "Generating the brief…" })).toBeInTheDocument();
    expect(screen.queryByText("In-memory limiter")).not.toBeInTheDocument();
  });

  it("banner: falls back to an older verdict review, shows score and cost, and the hint is reachable", () => {
    hooks.data = { brief: { ...BRIEF, usage: { ...BRIEF.usage, cost_usd: null } }, stale: false };
    const reviews = [
      review({ id: "new", created_at: "2026-02-01T00:00:00Z", verdict: null }),
      review({
        id: "old",
        created_at: "2026-01-01T00:00:00Z",
        verdict: "request_changes",
        score: 61,
        findings: [
          { severity: "CRITICAL", dismissed_at: null },
          { severity: "MAJOR", dismissed_at: null },
        ] as unknown as ReviewRecord["findings"],
      }),
    ];
    const { container } = renderCard("pr1", reviews);
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(container.textContent).toContain("2 findings · 1 blockers");
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(container.textContent).toContain("—");
    const hint = screen.getByRole("button", { name: "Where this information comes from" });
    expect(hint).toHaveAccessibleDescription(/latest agent review/);
    expect(hint).toHaveAccessibleDescription(/summary.*cost/);
    expect(hint.getAttribute("title")).toMatch(/cost/);

    cleanup();
    const zero = renderCard("pr1", [
      review({ id: "z", created_at: "2026-03-01T00:00:00Z", verdict: "approve", findings: [] as unknown as ReviewRecord["findings"] }),
    ]);
    expect(zero.container.textContent).toContain("0 findings · 0 blockers");

    cleanup();
    const none = renderCard("pr1", undefined);
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(none.container.querySelector("[role=alert]")).toBeNull();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
  });

  it("shows Outdated when stale", () => {
    hooks.data = { brief: BRIEF, stale: true };
    renderCard();
    expect(screen.getByText("Outdated")).toBeInTheDocument();
  });

  it("renders pre-revision-2 and null-line briefs without error", () => {
    hooks.data = { brief: BRIEF, stale: false };
    renderCard();
    expect(screen.getByText("In-memory limiter")).toBeInTheDocument();
    cleanup();
    hooks.data = {
      brief: { ...BRIEF, risks: [{ ...BRIEF.risks[0]!, line: null }] },
      stale: false,
    };
    renderCard();
    expect(screen.getByText("In-memory limiter")).toBeInTheDocument();
  });

  it("deep-links from risk files and focus rows, and renders model text literally", () => {
    hooks.data = {
      brief: { ...BRIEF, summary: "<b>x</b> bold?", review_focus: [{ file: "src/limiter.ts", line: 42, reason: "bucket refill math" }] },
      stale: false,
    };
    renderCard();

    expect(screen.getByText("<b>x</b> bold?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Why this is a risk" }));
    fireEvent.click(screen.getByRole("button", { name: "Open src/server.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/server.ts", null);

    const row = screen.getByRole("button", { name: "src/limiter.ts:42 — bucket refill math" });
    fireEvent.click(row);
    expect(onOpenFile).toHaveBeenLastCalledWith("src/limiter.ts", 42);
  });

  it("marks a stale brief Outdated, refresh regenerates, and notes empty/removed content", () => {
    hooks.data = {
      brief: {
        ...BRIEF,
        risks: [],
        review_focus: [],
        grounding: { ...BRIEF.grounding, risks_dropped: 2, focus_dropped: 1 },
      },
      stale: true,
    };
    renderCard();

    expect(screen.getByText("Outdated")).toBeInTheDocument();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("No specific review focus.")).toBeInTheDocument();
    expect(screen.getByText(/2 risk\(s\), 1 focus item\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-run the brief for this PR" }));
    expect(hooks.mutate).toHaveBeenCalledTimes(1);
  });

  it("keeps a stored brief visible with an inline retry on generation and load errors", () => {
    hooks.data = { brief: BRIEF, stale: false };
    hooks.generateIsError = true;
    renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Couldn't generate the PR brief.")).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(hooks.mutate).toHaveBeenCalledTimes(1);

    cleanup();
    hooks.generateIsError = false;
    hooks.isError = true;
    renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hooks.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the full error state only when there is no brief, and never an endless skeleton once prId resolves", () => {
    hooks.isError = true;
    renderCard();
    expect(screen.getByText("Couldn't load the PR brief.")).toBeInTheDocument();
    cleanup();

    hooks.isError = false;
    hooks.generateIsError = true;
    hooks.data = { brief: null, stale: false };
    renderCard();
    expect(screen.getByText("Couldn't generate the PR brief.")).toBeInTheDocument();
    cleanup();

    hooks.generateIsError = false;
    hooks.data = { brief: null, stale: false };
    renderCard(null);
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    cleanup();
    renderCard("pr1");
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
  });
  it("review focus: ordered rows, count badge, long path kept in title, empty state without badge", () => {
    const long = "src/" + "deep/".repeat(20) + "file.ts";
    hooks.data = {
      brief: { ...BRIEF, review_focus: [{ file: "src/limiter.ts", line: 42, reason: "bucket refill math" }, { file: long, line: 7, reason: "long one" }] },
      stale: false,
    };
    const { container } = renderCard();
    const list = container.querySelector("ol");
    expect(list?.querySelectorAll("li")).toHaveLength(2);
    expect(container.textContent).toContain("Review focus — read these first2");
    const marker = list?.querySelector("span[aria-hidden=true]");
    expect(marker?.textContent).toBe("▸");
    const row = screen.getByRole("button", { name: `${long}:7 — long one` });
    expect(row.querySelector(`[title="${long}:7"]`)).not.toBeNull();
    fireEvent.click(row);
    expect(onOpenFile).toHaveBeenLastCalledWith(long, 7);

    cleanup();
    hooks.data = { brief: { ...BRIEF, review_focus: [] }, stale: false };
    const empty = renderCard();
    expect(screen.getByText("No specific review focus.")).toBeInTheDocument();
    expect(empty.container.querySelector("ol")).toBeNull();
    expect(empty.container.textContent).not.toContain("Review focus — read these first0");
  });

  it("risk pills: icon fallback, file:line, single-open expand, literal text and navigation targets", () => {
    const base = BRIEF.risks[0]!;
    hooks.data = {
      brief: {
        ...BRIEF,
        risks: [
          { ...base, title: "Sec", kind: "security", line: 12, explanation: "<b>x</b> and **y**" },
          { ...base, title: "Odd", kind: "constructor", severity: "low", line: null, explanation: "second" },
          { ...base, title: "Old", kind: "api-contract", severity: "medium" },
        ],
      },
      stale: false,
    };
    const { container } = renderCard();
    // file:line only for a numeric line
    expect(container.textContent).toContain("src/limiter.ts:12");
    expect(screen.getByRole("button", { name: "Low: Odd" }).textContent).toBe("Oddsrc/limiter.ts");
    expect(screen.getByRole("button", { name: "Medium: Old" }).textContent).toBe("Oldsrc/limiter.ts");

    fireEvent.click(screen.getByRole("button", { name: "High: Sec" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/limiter.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: "Low: Odd" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/limiter.ts", null);

    const toggles = screen.getAllByRole("button", { name: "Why this is a risk" });
    expect(toggles.every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
    fireEvent.click(toggles[0]!);
    expect(screen.getByText("<b>x</b> and **y**")).toBeInTheDocument();
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    const links = screen.getAllByRole("button", { name: /^Open src\/.* in Files changed$/ });
    fireEvent.click(links[0]!);
    expect(onOpenFile).toHaveBeenLastCalledWith("src/limiter.ts", 12);
    fireEvent.click(links[1]!);
    expect(onOpenFile).toHaveBeenLastCalledWith("src/server.ts", null);

    fireEvent.click(toggles[1]!);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    expect(toggles[1]).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("<b>x</b> and **y**")).not.toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
    // the panel unfolds under its own pill, before the next pill
    const second = toggles[1]!.closest("li")!;
    expect(second).toContainElement(screen.getByText("second"));
    expect(document.getElementById(toggles[1]!.getAttribute("aria-controls")!)).toHaveTextContent("second");
    expect(
      screen.getByText("second").compareDocumentPosition(toggles[2]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(toggles[1]!);
    expect(screen.queryByText("second")).not.toBeInTheDocument();
  });

  it.each([
    ["loading", { isLoading: true, isError: false }, null],
    ["empty", { isLoading: false, isError: false }, "No intent yet"],
    ["error", { isLoading: false, isError: true }, "Couldn't load the PR intent."],
  ])("EC-49: Intent %s state does not hide the brief and has no Intent heading", (_name, state, text) => {
    hooks.data = { brief: BRIEF, stale: false };
    Object.assign(intentHooks, state);
    renderCard();

    // the brief is unaffected
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getAllByText("Risk areas")).toHaveLength(1);
    expect(screen.getByText("In-memory limiter")).toBeInTheDocument();
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();

    // D-f: Intent heading only in the ready state
    expect(screen.queryByText("Intent")).not.toBeInTheDocument();

    // Intent's own state (the skeleton has no accessible name: loading = none of the others)
    if (text) expect(screen.getByText(text)).toBeInTheDocument();
    else {
      expect(screen.queryByText("No intent yet")).not.toBeInTheDocument();
      expect(screen.queryByText("Couldn't load the PR intent.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Derive intent" })).not.toBeInTheDocument();
    }
    if (_name === "empty") {
      fireEvent.click(screen.getByRole("button", { name: "Derive intent" }));
    }
    if (_name === "error") {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(intentHooks.refetch).toHaveBeenCalledTimes(1);
    }
  });
});
