/* BlastRadiusCard — Blast Radius (L04) card for the Overview tab. Shows the
   PR's changed symbols and their downstream callers, endpoints, and crons,
   read straight from the repo-intel index (no LLM call, no re-parse).
   States: skeleton while loading, an error with retry, an optional degraded
   badge (with a resync action), the stats row, then a Tree/Graph toggle in
   the card header. Tree shows the "no downstream callers" text or one
   SymbolImpact per changed symbol; Graph renders the same data as a 3-column
   SVG (BlastGraph). Stats and the degraded badge are shared by both views.
   Modelled on IntentCard.tsx. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, ErrorState, Skeleton } from "@devdigest/ui";
import { blastKey, usePrBlast } from "@/lib/hooks/blast";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { blastStats } from "./helpers";
import { BlastGraph } from "./_components/BlastGraph";
import { BlastStats } from "./_components/BlastStats";
import { DegradedBadge } from "./_components/DegradedBadge";
import { SymbolImpact } from "./_components/SymbolImpact";
import { s } from "./styles";

type BlastView = "tree" | "graph";

export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
  headSha,
}: {
  prId: string | null;
  repoId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  // Disabled queries stay `isPending` forever, never `isLoading` — gate on
  // `!prId || isLoading`, not `isPending` (client/INSIGHTS.md, 2026-09-26).
  const { data: blast, isLoading, isError, refetch } = usePrBlast(prId);
  const resync = useResyncRepoIntel(repoId);
  const [resyncStarted, setResyncStarted] = React.useState(false);
  const [view, setView] = React.useState<BlastView>("tree");

  const handleResync = () => {
    resync.mutate(undefined, {
      onSuccess: () => {
        setResyncStarted(true);
        qc.invalidateQueries({ queryKey: blastKey(prId) });
      },
    });
  };

  const content = (() => {
    if (!prId || isLoading) {
      return (
        <Card>
          <Skeleton height={13} width="30%" style={{ marginBottom: 16 }} />
          <Skeleton height={60} />
        </Card>
      );
    }
    if (isError || !blast) {
      return (
        <Card>
          <ErrorState body={t("loadError")} onRetry={() => refetch()} />
        </Card>
      );
    }
    const counts = blastStats(blast);
    return (
      <Card>
        {blast.degraded && blast.reason && (
          <DegradedBadge
            reason={blast.reason}
            onResync={handleResync}
            resyncing={resync.isPending}
            started={resyncStarted}
          />
        )}
        <div style={s.cardHeader}>
          <BlastStats counts={counts} />
          <div style={s.viewToggle}>
            <button
              type="button"
              aria-pressed={view === "tree"}
              onClick={() => setView("tree")}
              style={view === "tree" ? { ...s.viewButton, ...s.viewButtonActive } : s.viewButton}
            >
              {t("view.tree")}
            </button>
            <button
              type="button"
              aria-pressed={view === "graph"}
              onClick={() => setView("graph")}
              style={view === "graph" ? { ...s.viewButton, ...s.viewButtonActive } : s.viewButton}
            >
              {t("view.graph")}
            </button>
          </div>
        </div>
        {view === "graph" ? (
          <BlastGraph blast={blast} repoFullName={repoFullName} headSha={headSha} />
        ) : blast.downstream.length === 0 ? (
          <p style={s.noDownstream}>{t("noDownstream", { count: blast.changed_symbols.length })}</p>
        ) : (
          <div style={s.symbolList}>
            {blast.downstream.map((impact) => (
              <SymbolImpact key={impact.symbol} impact={impact} repoFullName={repoFullName} headSha={headSha} />
            ))}
          </div>
        )}
      </Card>
    );
  })();

  return <div aria-live="polite">{content}</div>;
}
