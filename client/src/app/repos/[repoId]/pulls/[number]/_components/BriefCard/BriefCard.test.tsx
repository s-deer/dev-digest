import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, PrBriefResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
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

const onOpenFile = vi.fn();

function renderCard(prId: string | null = "pr1") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <BriefCard prId={prId} onOpenFile={onOpenFile} />
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
  hooks.mutate.mockClear();
  onOpenFile.mockClear();
});
afterEach(cleanup);

describe("BriefCard", () => {
  it("offers Generate when there is no brief, shows a disabled action while generating, then renders the brief", () => {
    hooks.data = { brief: null, stale: false };
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(hooks.mutate).toHaveBeenCalledTimes(1);

    cleanup();
    hooks.isPending = true;
    renderCard();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(screen.queryByText(BRIEF.summary)).not.toBeInTheDocument();

    cleanup();
    hooks.isPending = false;
    hooks.data = { brief: BRIEF, stale: false };
    renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByText("In-memory limiter")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
    expect(screen.getByText("Generated without: no specs attached")).toBeInTheDocument();
  });

  it("deep-links from risk files and focus rows, and renders model text literally", () => {
    hooks.data = {
      brief: { ...BRIEF, summary: "<b>x</b> bold?", review_focus: [{ file: "src/limiter.ts", line: 42, reason: "bucket refill math" }] },
      stale: false,
    };
    renderCard();

    expect(screen.getByText("<b>x</b> bold?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open src/server.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/server.ts", null);

    const row = screen.getByText((_, el) => el?.tagName === "BUTTON" && el.textContent === "src/limiter.ts:42 — bucket refill math");
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
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
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
});
