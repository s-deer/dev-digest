import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const get = vi.fn();
const post = vi.fn();
vi.mock("../api", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

import { briefKey, useGenerateBrief, usePrBrief } from "./brief";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("brief hooks", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("AC-43: reading GETs the stored brief only, and never fetches while the PR id is unresolved", async () => {
    get.mockResolvedValue({ brief: null, stale: false });
    const { wrapper } = setup();
    const idle = renderHook(() => usePrBrief(null), { wrapper });
    expect(idle.result.current.fetchStatus).toBe("idle");
    const live = renderHook(() => usePrBrief("pr1"), { wrapper });
    await waitFor(() => expect(live.result.current.data).toEqual({ brief: null, stale: false }));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/pulls/pr1/brief");
    expect(post).not.toHaveBeenCalled();
  });

  it("AC-5/AC-8: a successful generate replaces the cache as fresh; a failed one leaves the stored brief untouched", async () => {
    const { qc, wrapper } = setup();
    const old = { brief: { summary: "old" }, stale: true };
    qc.setQueryData(briefKey("pr1"), old);
    const { result } = renderHook(() => useGenerateBrief("pr1"), { wrapper });

    post.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    expect(qc.getQueryData(briefKey("pr1"))).toEqual(old);

    post.mockResolvedValueOnce({ brief: { summary: "new" }, stale: true });
    await act(() => result.current.mutateAsync());
    expect(post).toHaveBeenLastCalledWith("/pulls/pr1/brief");
    expect(qc.getQueryData(briefKey("pr1"))).toEqual({ brief: { summary: "new" }, stale: false });
  });
});
