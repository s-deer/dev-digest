import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Severity } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { SeverityPills } from "./SeverityPills";

afterEach(cleanup);

function renderPills(counts: Record<Severity, number>, active: Severity | null, onToggle = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityPills counts={counts} active={active} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
}

describe("SeverityPills", () => {
  it("renders only non-zero severities in CRITICAL · WARNING · SUGGESTION order", () => {
    renderPills({ CRITICAL: 1, WARNING: 0, SUGGESTION: 4 }, null);
    const pills = screen.getAllByRole("button");
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveAccessibleName("1 Critical");
    expect(pills[1]).toHaveAccessibleName("4 Suggestion");
    expect(screen.queryByRole("button", { name: "0 Warning" })).not.toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("renders nothing when there are no findings", () => {
    const { container } = renderPills({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, null);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the active pill pressed and reports clicks", () => {
    const onToggle = vi.fn();
    renderPills({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }, "WARNING", onToggle);
    const warning = screen.getByRole("button", { name: "1 Warning" });
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2 Critical" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(warning);
    expect(onToggle).toHaveBeenCalledWith("WARNING");
  });
});
