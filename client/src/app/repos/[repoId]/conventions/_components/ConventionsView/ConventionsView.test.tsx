import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionsView } from "./ConventionsView";

const hooks = vi.hoisted(() => ({ draft: vi.fn(), extract: vi.fn(), update: vi.fn() }));

const state = {
  last_scan: {
    id: "scan-1",
    repo_id: "repo-1",
    status: "done" as const,
    provider: "openrouter" as const,
    model: "model",
    sampled_files: ["a.ts", "b.ts", "c.ts"],
    proposed: 3,
    kept: 3,
    dropped_ungrounded: 0,
    dropped_duplicate: 0,
    cost_usd: null,
    error: null,
    started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    finished_at: new Date().toISOString(),
  },
  candidates: [
    {
      id: "candidate-1",
      repo_id: "repo-1",
      scan_id: "scan-1",
      category: "api" as const,
      rule: "Always use async/await instead of .then() chains.",
      rationale: null,
      evidence_path: "src/api/users.ts",
      evidence_line: 23,
      evidence_snippet: "const user = await db.users.find(id);",
      confidence: 0.91,
      status: "accepted" as const,
      created_at: "",
      updated_at: "",
    },
  ],
  counts: { pending: 0, accepted: 1, rejected: 0 },
};

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: (_repoId: string, status: string) => ({ data: status === "rejected" ? { ...state, candidates: [], counts: { pending: 0, accepted: 0, rejected: 0 } } : state, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: hooks.extract, isPending: false }),
  useConventionSkillDraft: () => ({ mutate: hooks.draft, isPending: false }),
  useUpdateConvention: () => ({ mutate: hooks.update, mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

afterEach(() => cleanup());

describe("ConventionsView", () => {
  it("matches the accepted design state and exposes scan/create actions", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionsView repoId="repo-1" repoName="acme/payments-api" branch="main" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Conventions in payments-api" })).toBeInTheDocument();
    expect(screen.getByText("Detected from 3 sample files · last scan 1h ago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ReScan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create skill/ })).toBeInTheDocument();
    expect(screen.getByText("1 of 1 accepted")).toBeInTheDocument();
  });
});
