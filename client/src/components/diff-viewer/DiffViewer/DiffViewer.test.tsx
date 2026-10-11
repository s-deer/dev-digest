import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import { DiffViewer } from "./DiffViewer";
import type { DiffFindingsApi } from "../findings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

// Hunk header @@ -1,3 +1,4 @@ → oldNo/newNo start at 1. Line-by-line:
//   " ctx before"   → ctx  (old=1, new=1)
//   "+added line"   → add  (new=2)   ← the anchored finding lands here
//   " ctx after"    → ctx  (old=2, new=3)
//   "-removed line" → del  (old=3)
const FILE_WITH_FINDINGS: PrFile = {
  path: "src/config.ts",
  additions: 1,
  deletions: 1,
  patch: ["@@ -1,3 +1,4 @@", " ctx before", "+added line", " ctx after", "-removed line"].join("\n"),
};

const FILE_WITHOUT_FINDINGS: PrFile = {
  path: "src/other.ts",
  additions: 1,
  deletions: 0,
  patch: ["@@ -1,1 +1,2 @@", "+another line"].join("\n"),
};

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: FILE_WITH_FINDINGS.path,
    start_line: 2,
    end_line: 2,
    rationale: "r",
    suggestion: null,
    confidence: 0.5,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const ANCHORED = finding({ id: "anchored", severity: "CRITICAL", title: "Hardcoded secret", start_line: 2 });
const UNANCHORED = finding({ id: "unanchored", severity: "WARNING", title: "Missing test", start_line: 99 });

function renderDiff(show: boolean, onAction = vi.fn()) {
  const findingsApi: DiffFindingsApi = {
    byPath: new Map([[FILE_WITH_FINDINGS.path, [ANCHORED, UNANCHORED]]]),
    show,
    onAction,
    pending: false,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <DiffViewer files={[FILE_WITH_FINDINGS, FILE_WITHOUT_FINDINGS]} findings={findingsApi} />
    </NextIntlClientProvider>,
  );
}

describe("DiffViewer — findings", () => {
  it("renders an anchored finding inline under RIGHT:2 with its severity stripe/label, puts the unanchored one in the end-of-file block, dots only the file with findings, and Accept calls onAction", () => {
    const onAction = vi.fn();
    renderDiff(true, onAction);

    // Inline card under its line, with the top-severity label.
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();

    // Unanchored finding surfaces in "Findings outside the diff", not silently dropped.
    expect(screen.getByText("Findings outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Missing test")).toBeInTheDocument();

    // The dot (aria-label "N finding(s)") appears once — only for the file with findings.
    expect(screen.getAllByLabelText(/finding\(s\)/i)).toHaveLength(1);

    // Both cards render (show:true) — scope to the anchored card specifically
    // (not "the first Accept button") so the assertion still holds if the
    // end-of-file block ever renders before the inline one.
    const anchoredCard = screen.getByText("Hardcoded secret").closest("[data-finding-id='anchored']");
    fireEvent.click(within(anchoredCard as HTMLElement).getByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenCalledWith("anchored", "accept");
  });

  it("hides both the inline and outside-the-diff cards when show is false", () => {
    renderDiff(false);

    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing test")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the diff")).not.toBeInTheDocument();
  });
});

describe("DiffViewer — deep-link arrival (AC-77, AC-78)", () => {
  function renderTarget(opts: { line: number | null; reduced?: boolean; withTarget?: boolean }) {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: !!opts.reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    render(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <DiffViewer
          files={[FILE_WITH_FINDINGS, FILE_WITHOUT_FINDINGS]}
          target={opts.withTarget === false ? undefined : { file: FILE_WITH_FINDINGS.path, line: opts.line }}
        />
      </NextIntlClientProvider>,
    );
    return scroll;
  }
  const card = (path: string) => screen.getByText(path).closest("div")!.parentElement as HTMLElement;
  const row = (n: number) => document.querySelector(`[data-new-line="${n}"]`) as HTMLElement;

  it("accents the target card, scrolls smoothly below the sticky header and pulses the line for under 2 s", () => {
    const scroll = renderTarget({ line: 2 });
    expect(card(FILE_WITH_FINDINGS.path).style.border).toBe("1px solid var(--accent)");
    expect(card(FILE_WITHOUT_FINDINGS.path).style.border).toBe("1px solid var(--border)");
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(row(2).style.scrollMarginTop).toBe("148px");
    expect(row(2).style.animation).toContain("ddLinePulse 1.7s");
    expect(row(1).style.animation).toBe("");
  });

  it("uses auto scroll and a static tint without animation under reduced motion", () => {
    const scroll = renderTarget({ line: 2, reduced: true });
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(row(2).style.animation).toBe("");
    expect(row(2).style.background).toBe("var(--accent-bg)");
  });

  it("falls back to the card when the line is not rendered", () => {
    const scroll = renderTarget({ line: 99 });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(card(FILE_WITH_FINDINGS.path));
    expect(document.querySelector("[style*='ddLinePulse']")).toBeNull();
  });

  it("does nothing special without a target", () => {
    const scroll = renderTarget({ line: null, withTarget: false });
    expect(scroll).not.toHaveBeenCalled();
    expect(card(FILE_WITH_FINDINGS.path).style.border).toBe("1px solid var(--border)");
    expect(document.querySelector("[style*='ddLinePulse']")).toBeNull();
  });
});
