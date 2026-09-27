import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import prReview from "../../../../messages/en/prReview.json";
import { FindingComment } from "./FindingComment";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingComment", () => {
  it("renders inline, collapses to one line, and fires Accept/Dismiss", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingComment finding={FINDING} onAction={onAction} />);

    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText(/Stripe key is committed in source/)).toBeInTheDocument();

    // Collapse (P3) via the top-right × — a real button with aria-expanded,
    // not an aria-label that hides the finding's title/severity.
    fireEvent.click(screen.getByRole("button", { name: /collapse/i }));
    expect(screen.queryByText(/Stripe key is committed in source/)).not.toBeInTheDocument();

    // Expand again by clicking the (now one-line) header — its accessible
    // name is the finding's own content (severity + title), not "Expand".
    fireEvent.click(screen.getByRole("button", { name: /Hardcoded Stripe secret key/i }));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});
