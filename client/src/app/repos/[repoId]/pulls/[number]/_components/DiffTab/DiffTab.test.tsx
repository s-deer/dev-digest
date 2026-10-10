import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import brief from "../../../../../../../../messages/en/brief.json";
import { DiffTab } from "./DiffTab";

const {
  usePrCommentsMock,
  useCreatePrCommentMock,
  usePrReviewsMock,
  useFindingActionMock,
  useSmartDiffMock,
  mutateMock,
} = vi.hoisted(() => ({
  usePrCommentsMock: vi.fn(),
  useCreatePrCommentMock: vi.fn(),
  usePrReviewsMock: vi.fn(),
  useFindingActionMock: vi.fn(),
  useSmartDiffMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: usePrCommentsMock,
  useCreatePrComment: useCreatePrCommentMock,
  usePrReviews: usePrReviewsMock,
  useFindingAction: useFindingActionMock,
}));

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: useSmartDiffMock,
  smartDiffKey: vi.fn(),
}));

afterEach(cleanup);

const FILE = {
  path: "src/config.ts",
  additions: 1,
  deletions: 0,
  patch: ["@@ -1,1 +1,2 @@", " ctx", "+added line"].join("\n"),
};

const REVIEWS: ReviewRecord[] = [
  {
    id: "r1",
    pr_id: "p1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 40,
    model: "m",
    grounding: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    created_at: "2026-01-02T00:00:00.000Z",
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded secret",
        file: "src/config.ts",
        start_line: 2,
        end_line: 2,
        rationale: "A secret is committed.",
        suggestion: null,
        confidence: 0.9,
        kind: "finding",
        trifecta_components: null,
        evidence: null,
        review_id: "r1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [{ path: FILE.path, additions: FILE.additions, deletions: FILE.deletions, finding_lines: [2] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
};

const DOC = {
  path: "docs/guide.md",
  additions: 2,
  deletions: 0,
  patch: ["@@ -10,1 +10,3 @@", " intro text", "+deep link target text", "+tail text"].join("\n"),
};

const SMART_DIFF_WITH_DOCS: SmartDiffResponse = {
  groups: [
    ...SMART_DIFF.groups,
    {
      role: "docs",
      files: [{ path: DOC.path, additions: DOC.additions, deletions: DOC.deletions, finding_lines: [] }],
    },
  ],
  split_suggestion: SMART_DIFF.split_suggestion,
};

function renderTab(target?: { file: string; line: number | null } | null, files = [FILE]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview, brief }}>
      <DiffTab prId="p1" filesCount={files.length} files={files} canComment target={target} />
    </NextIntlClientProvider>,
  );
}

const scrollIntoViewMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = scrollIntoViewMock;
  usePrCommentsMock.mockReturnValue({ data: [] });
  useCreatePrCommentMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  usePrReviewsMock.mockReturnValue({ data: REVIEWS });
  useFindingActionMock.mockReturnValue({ isPending: false, mutate: mutateMock });
  // Smart Diff errored/unavailable by default so the pre-existing "findings
  // in the flat diff" tests below stay decoupled from group rendering.
  useSmartDiffMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
});

describe("DiffTab", () => {
  it("shows the latest review's finding inline under its line with the file dot, and Accept calls the mutation", () => {
    renderTab();

    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByLabelText(/finding\(s\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutateMock).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "p1" });
  });

  it("the single Show/Hide toggle hides the finding card", () => {
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /hide comments/i }));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show comments/i }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("falls back to the flat original order while Smart Diff is loading or errored", () => {
    useSmartDiffMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderTab();

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText(FILE.path)).toBeInTheDocument();
  });

  it("renders Smart order groups by default, and the Original order toggle switches to (and back from) the flat list", () => {
    useSmartDiffMock.mockReturnValue({ data: SMART_DIFF, isLoading: false, isError: false });
    renderTab();

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText(FILE.path)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /original order/i }));
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText(FILE.path)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /smart order/i }));
    expect(screen.getByText("Core logic")).toBeInTheDocument();
  });

  it("shows the 'no review yet' hint instead of counters when no review has run", () => {
    usePrReviewsMock.mockReturnValue({ data: [] });
    renderTab();

    expect(screen.getByText("Review hasn't been run yet")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("deep link: expands a default-collapsed group, shows the target line and scrolls to it", () => {
    useSmartDiffMock.mockReturnValue({ data: SMART_DIFF_WITH_DOCS, isLoading: false, isError: false });
    renderTab({ file: DOC.path, line: 11 }, [FILE, DOC]);

    expect(screen.getByText("deep link target text")).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    const row = scrollIntoViewMock.mock.contexts[0] as HTMLElement;
    expect(row.getAttribute("data-new-line")).toBe("11");
    expect(screen.queryByText(/File not in this PR/)).not.toBeInTheDocument();
  });

  it("deep link: without a rendered line it falls back to scrolling the file header", () => {
    useSmartDiffMock.mockReturnValue({ data: SMART_DIFF_WITH_DOCS, isLoading: false, isError: false });
    renderTab({ file: DOC.path, line: 999 }, [FILE, DOC]);
    expect(screen.getByText("tail text")).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect((scrollIntoViewMock.mock.contexts[0] as HTMLElement).hasAttribute("data-new-line")).toBe(false);

    cleanup();
    scrollIntoViewMock.mockClear();
    renderTab({ file: FILE.path, line: null });
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("deep link: an unknown file shows the not-in-diff note naming it and still renders the diff", () => {
    renderTab({ file: "src/gone.ts", line: 3 });
    expect(screen.getByText("File not in this PR's diff: src/gone.ts")).toBeInTheDocument();
    expect(screen.getByText(FILE.path)).toBeInTheDocument();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("without a target nothing scrolls and no note is shown", () => {
    renderTab();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/File not in this PR/)).not.toBeInTheDocument();
  });
});
