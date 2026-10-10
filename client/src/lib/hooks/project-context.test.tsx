import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const put = vi.fn();
vi.mock("../api", () => ({ api: { put: (...a: unknown[]) => put(...a), get: vi.fn() } }));

import { projectContextKeys, useSetAgentProjectContext, useSetSkillProjectContext } from "./project-context";

const LIMITS = { doc_cap_tokens: 3000, run_budget_tokens: 7500, max_attachments: 50 };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("project-context save hooks", () => {
  beforeEach(() => put.mockReset());

  it("an agent save caches the server's state and refreshes the listing", async () => {
    const saved = { items: [], total_tokens: 0, would_skip: [], limits: LIMITS, inherited: [], totals: { context_tokens: 0, specs_tokens: 0, total: 0 } };
    put.mockResolvedValue(saved);
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetAgentProjectContext(), { wrapper });
    await act(() => result.current.mutateAsync({ agentId: "a1", repoId: "r1", paths: ["docs/a.md"] }));
    expect(put).toHaveBeenCalledWith("/agents/a1/project-context", { repo_id: "r1", paths: ["docs/a.md"] });
    expect(qc.getQueryData(projectContextKeys.agent("a1", "r1"))).toEqual(saved);
    expect(spy).toHaveBeenCalledWith({ queryKey: projectContextKeys.listing("r1") });
  });

  it("a skill save also invalidates agent queries (inherited rows change)", async () => {
    put.mockResolvedValue({ items: [], total_tokens: 0, would_skip: [], limits: LIMITS });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetSkillProjectContext(), { wrapper });
    await act(() => result.current.mutateAsync({ skillId: "s1", repoId: "r1", paths: [] }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: projectContextKeys.agentAll }));
    expect(spy).toHaveBeenCalledWith({ queryKey: projectContextKeys.listing("r1") });
  });
});
