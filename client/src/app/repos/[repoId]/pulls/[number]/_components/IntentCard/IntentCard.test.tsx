import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { IntentCard } from "./IntentCard";

const RECORD: PrIntentRecord = {
  intent: "Add rate limiting to the public webhook endpoints.",
  in_scope: ["Add a token-bucket limiter middleware", "Return 429 with Retry-After"],
  out_of_scope: ["Auth changes", "Webhook payload schema changes"],
  change_type: "feature",
  confidence: "high",
  confidence_score: 0.85,
  sources: [{ kind: "issue", ref: "#471", fetched: true, note: null }],
  missing_docs: false,
  pr_id: "pr1",
  head_sha: "abc1234",
  stale: false,
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 1200,
  tokens_out: 300,
  cost_usd: 0.002,
  cost_usd_total: 0.002,
  updated_at: "2026-01-01T00:00:00.000Z",
};

const hooks = vi.hoisted(() => ({
  intent: null as PrIntentRecord | null,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
  generateIsError: false,
}));

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({
    data: hooks.intent,
    isLoading: hooks.isLoading,
    isError: hooks.isError,
    refetch: hooks.refetch,
  }),
  useGenerateIntent: () => ({ mutate: hooks.mutate, isPending: hooks.isPending, isError: hooks.generateIsError }),
}));

afterEach(() => {
  cleanup();
  hooks.intent = null;
  hooks.isLoading = false;
  hooks.isError = false;
  hooks.isPending = false;
  hooks.generateIsError = false;
  hooks.refetch.mockClear();
  hooks.mutate.mockClear();
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders the quote and IN/OUT scope, but never confidence or sources; an empty out-of-scope list reads 'None stated'", () => {
    hooks.intent = RECORD;
    renderCard();

    expect(screen.getByText("“Add rate limiting to the public webhook endpoints.”")).toBeInTheDocument();
    expect(screen.getByText("IN SCOPE")).toBeInTheDocument();
    expect(screen.getByText("OUT OF SCOPE")).toBeInTheDocument();
    expect(screen.getByText("Add a token-bucket limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Auth changes")).toBeInTheDocument();

    expect(screen.queryByText(/85%|high|0\.85/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/#471/)).not.toBeInTheDocument();
    expect(screen.queryByText(/feature/i)).not.toBeInTheDocument();

    cleanup();
    hooks.intent = { ...RECORD, out_of_scope: [] };
    renderCard();
    expect(screen.getByText("None stated")).toBeInTheDocument();
  });

  it("shows the empty state and generates a brief on click", () => {
    hooks.intent = null;
    renderCard();

    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(hooks.mutate).toHaveBeenCalledWith(false);
  });

  it("shows an error state with retry when the intent query fails", () => {
    hooks.isError = true;
    renderCard();

    expect(screen.getByText("Couldn't load the PR intent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hooks.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error state with retry when generating a brief fails", () => {
    hooks.intent = null;
    hooks.generateIsError = true;
    renderCard();

    expect(screen.getByText("Couldn't generate the PR brief.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hooks.mutate).toHaveBeenCalledWith(false);
  });
});
