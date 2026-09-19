"use client";

import React, { useEffect, useState } from "react";
import type { RunSummary } from "@devdigest/shared";

// Lives at client/src/app/agents/[id]/_components/AgentRunsPanel/AgentRunsPanel.tsx

export function AgentRunsPanel({ agentId }: { agentId: string }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | "succeeded" | "failed">("all");
  const [sort, setSort] = useState<"newest" | "cost">("newest");
  const [visible, setVisible] = useState<RunSummary[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 20;
  const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1 };

  useEffect(() => {
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"}/agents/${agentId}/runs`)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((data: RunSummary[]) => {
        setRuns(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [agentId]);

  useEffect(() => {
    let list = runs;
    if (status !== "all") list = list.filter((r) => r.status === status);
    if (sort === "newest") {
      list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      list = [...list].sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0));
    }
    setVisible(list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    setTotalCost(list.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0));
  }, [runs, status, sort, page]);

  async function rerun(runId: string) {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"}/runs/${runId}/rerun`, { method: "POST" });
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"}/agents/${agentId}/runs`);
    setRuns(await r.json());
  }

  if (loading) return <div style={{ padding: 16, color: "var(--text-secondary)" }}>Loading runs…</div>;
  if (error) return <div style={{ padding: 16, color: "var(--danger)" }}>Failed to load runs: {error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Runs ({runs.length})</h3>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Total cost: ${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}
        </span>
      </div>

      {/* filters */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["all", "succeeded", "failed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(0); }}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: status === s ? "var(--bg-hover)" : "transparent",
            }}
          >
            {s === "all" ? "All" : s === "succeeded" ? "Succeeded" : "Failed"}
          </button>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "cost")}>
          <option value="newest">Newest</option>
          <option value="cost">Most expensive</option>
        </select>
      </div>

      {/* list */}
      {visible.length === 0 ? (
        <div style={{ color: "var(--text-secondary)" }}>No runs match.</div>
      ) : (
        visible.map((run) => {
          const score = (run.findings ?? []).reduce((acc, f) => acc + (SEVERITY_WEIGHT[f.severity] ?? 0), 0);
          const risk = score >= 20 ? "high" : score >= 8 ? "medium" : "low";
          const minutes = Math.round((Date.now() - new Date(run.created_at).getTime()) / 60000);
          const ago = minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`;
          return (
            <div
              key={run.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: 10,
                borderRadius: 8,
                border: "1px solid " + (risk === "high" ? "var(--danger)" : "var(--border)"),
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>PR #{run.pr_number}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {ago} · {run.findings?.length ?? 0} findings · risk {risk}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>${(run.cost_usd ?? 0).toFixed(4)}</span>
                {run.status === "failed" && <button onClick={() => rerun(run.id)}>Re-run</button>}
              </div>
            </div>
          );
        })
      )}

      {/* pager */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
        <button disabled={(page + 1) * PAGE_SIZE >= runs.length} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
