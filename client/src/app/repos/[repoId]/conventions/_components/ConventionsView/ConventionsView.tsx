"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState } from "@devdigest/ui";
import type { ConventionFilter } from "@/lib/hooks/conventions";
import { useConventions, useConventionSkillDraft, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { candidatesForFilter, acceptedCandidates } from "../../helpers";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { s } from "../../styles";

export function ConventionsView({ repoId, repoName, branch }: { repoId: string; repoName: string; branch: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const [filter, setFilter] = React.useState<ConventionFilter>("all");
  const [draftOpen, setDraftOpen] = React.useState(false);
  const defaultState = useConventions(repoId, "pending,accepted");
  const rejectedState = useConventions(repoId, "rejected");
  const extract = useExtractConventions(repoId);
  const draft = useConventionSkillDraft(repoId);
  const update = useUpdateConvention(repoId);
  const state = filter === "rejected" ? rejectedState.data : defaultState.data;
  const candidates = candidatesForFilter(state, filter === "rejected" ? "rejected" : filter);
  const counts = defaultState.data?.counts ?? { pending: 0, accepted: 0, rejected: 0 };
  const scan = defaultState.data?.last_scan;
  const scanning = scan?.status === "running" || extract.isPending;
  const accepted = acceptedCandidates(defaultState.data);

  const runScan = () => {
    if (counts.accepted > 0 && !window.confirm(t("scan.rescanConfirm"))) return;
    extract.mutate();
  };
  const createSkill = () => {
    draft.mutate(accepted.map((candidate) => candidate.id), { onSuccess: () => setDraftOpen(true) });
  };
  const acceptAll = async () => {
    await Promise.all((defaultState.data?.candidates ?? []).filter((candidate) => candidate.status === "pending").map((candidate) => update.mutateAsync({ id: candidate.id, patch: { status: "accepted" } })));
    toast.success(t("toasts.acceptedAll"));
  };

  if (defaultState.isError || rejectedState.isError) return <ErrorState title={t("errors.title")} body={t("errors.body")} onRetry={() => { void defaultState.refetch(); void rejectedState.refetch(); }} />;
  if (defaultState.isLoading) return <div style={s.page}>{t("loading")}</div>;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div>
          <h1 style={s.title}>{t("title", { repo: repoName })}</h1>
          <p style={s.subtitle}>
            {scan ? t("scan.meta", { files: scan.sampled_files.length, model: scan.model, time: new Date(scan.started_at).toLocaleString() }) : t("scan.none")}
          </p>
        </div>
        <div style={s.actions}><Button kind="secondary" onClick={runScan} loading={scanning} disabled={scanning}>{scan ? t("scan.rescan") : t("scan.run")}</Button>{accepted.length > 0 && <Button kind="primary" onClick={createSkill} loading={draft.isPending}>{t("createSkill")}</Button>}</div>
      </header>

      {scan?.status === "failed" && <ErrorState title={t("scan.failed")} body={scan.error ?? t("errors.body")} onRetry={runScan} />}
      {scan?.status === "done" && scan.kept === 0 && <div style={s.banner}>{t("scan.nothing", { proposed: scan.proposed, dropped: scan.dropped_ungrounded })}</div>}

      <div style={s.toolbar}>
        <div style={s.chips}>
          <Chip active={filter === "all"} onClick={() => setFilter("all")} count={counts.pending + counts.accepted}>{t("filters.all")}</Chip>
          <Chip active={filter === "pending"} onClick={() => setFilter("pending")} count={counts.pending}>{t("filters.pending")}</Chip>
          <Chip active={filter === "accepted"} onClick={() => setFilter("accepted")} count={counts.accepted}>{t("filters.accepted")}</Chip>
          <Chip active={filter === "rejected"} onClick={() => setFilter("rejected")} count={counts.rejected}>{t("filters.rejected")}</Chip>
        </div>
        {counts.pending > 0 && <Button size="sm" kind="ghost" onClick={acceptAll}>{t("acceptAll")}</Button>}
      </div>

      {candidates.length === 0 ? (
        <EmptyState icon="ListChecks" title={t(scan ? "empty.afterScan" : "empty.beforeScan")} body={t(scan ? "empty.afterScanBody" : "empty.beforeScanBody")} cta={!scan ? t("scan.run") : undefined} onCta={runScan} ctaLoading={scanning} />
      ) : (
        <div style={s.list}>{candidates.map((candidate) => <ConventionCard key={candidate.id} candidate={candidate} repoFullName={repoName} branch={branch} />)}</div>
      )}

      {draftOpen && draft.data && <CreateSkillModal repoId={repoId} repoName={repoName} draft={draft.data} onClose={() => setDraftOpen(false)} onCreated={(id) => { setDraftOpen(false); window.location.href = `/skills/${id}`; }} />}
    </div>
  );
}
