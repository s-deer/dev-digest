import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

const hooks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/hooks/conventions", () => ({
  useUpdateConvention: () => ({ mutate: hooks.mutate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  hooks.mutate.mockClear();
});

const candidate = {
  id: "00000000-0000-0000-0000-000000000001",
  repo_id: "00000000-0000-0000-0000-000000000002",
  scan_id: null,
  category: "api" as const,
  rule: "Validate request bodies at the route boundary.",
  rationale: "Malformed input is rejected before service logic.",
  evidence_path: "src/api/users.ts",
  evidence_line: 18,
  evidence_snippet: "schema: { body: CreateUserBody }",
  confidence: 0.94,
  status: "pending" as const,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function renderCard() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard candidate={candidate} repoFullName="acme/payments-api" branch="main" />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("renders evidence and sends accept, reject, and inline edit patches", () => {
    renderCard();
    expect(screen.getByText("Validate request bodies at the route boundary.")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:18")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(hooks.mutate).toHaveBeenCalledWith({ id: candidate.id, patch: { status: "accepted" } });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "Use schemas at every route boundary." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(hooks.mutate).toHaveBeenCalledWith(
      { id: candidate.id, patch: { rule: "Use schemas at every route boundary.", rationale: candidate.rationale, category: "api" } },
      expect.anything(),
    );
  });
});
