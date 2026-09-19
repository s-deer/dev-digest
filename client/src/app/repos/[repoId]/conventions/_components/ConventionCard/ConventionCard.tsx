"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, MonoLink, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, ConventionStatus } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { useUpdateConvention } from "@/lib/hooks/conventions";
import { s } from "../../styles";

const CATEGORIES: ConventionCategory[] = ["naming", "structure", "errors", "testing", "imports", "typing", "api", "general"];

export function ConventionCard({ candidate, repoFullName, branch }: { candidate: ConventionCandidate; repoFullName: string; branch: string }) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention(candidate.repo_id);
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [rationale, setRationale] = React.useState(candidate.rationale ?? "");
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);
  const percent = Math.round(candidate.confidence * 100);
  const evidenceUrl = githubBlobUrl(repoFullName, branch, candidate.evidence_path, candidate.evidence_line ?? undefined);

  const save = () => {
    update.mutate(
      { id: candidate.id, patch: { rule, rationale: rationale || null, category } },
      { onSuccess: () => setEditing(false) },
    );
  };
  const setStatus = (status: ConventionStatus) => update.mutate({ id: candidate.id, patch: { status } });

  return (
    <article className="dd-convention-card" style={{ ...s.card, ...(candidate.status === "accepted" ? s.cardAccepted : {}) }}>
      <div>
        {editing ? (
          <div style={s.edit}>
            <Textarea value={rule} onChange={setRule} rows={3} />
            <Textarea value={rationale} onChange={setRationale} rows={2} />
            <SelectInput value={category} onChange={(value) => setCategory(value as ConventionCategory)} options={CATEGORIES.map((value) => ({ value, label: t(`categories.${value}`) }))} />
            <div style={{ display: "flex", gap: 8 }}>
              <Button kind="primary" onClick={save} loading={update.isPending}>{t("card.save")}</Button>
              <Button kind="secondary" onClick={() => setEditing(false)}>{t("card.cancel")}</Button>
            </div>
          </div>
        ) : (
          <>
            <h2 style={s.rule}>{candidate.rule}</h2>
            <div style={s.evidence}>
              <div style={s.evidenceTop}>
                <MonoLink href={evidenceUrl}>{candidate.evidence_path}:{candidate.evidence_line ?? "?"}</MonoLink>
                <Button size="sm" kind="ghost" icon="Copy" aria-label={t("card.copy")} onClick={() => navigator.clipboard?.writeText(candidate.evidence_snippet)} />
              </div>
              <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
            </div>
            <div style={s.confidence}>
              <span style={s.confidenceLabel}>{t("card.confidence")}</span>
              <div style={s.confidenceBar}>
                <ProgressBar value={percent} height={5} color={percent >= 85 ? "var(--ok)" : "var(--warn)"} />
              </div>
              <span className="mono tnum" style={{ color: percent >= 85 ? "var(--ok)" : "var(--warn)", fontSize: 11 }}>{percent}%</span>
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="dd-convention-card-actions" style={s.cardActions}>
          {candidate.status === "rejected" ? (
            <Button full kind="secondary" icon="CornerDownRight" onClick={() => setStatus("pending")} loading={update.isPending}>{t("card.undo")}</Button>
          ) : (
            <>
              <Button full kind={candidate.status === "accepted" ? "primary" : "secondary"} icon={candidate.status === "accepted" ? "Check" : undefined} onClick={() => setStatus(candidate.status === "accepted" ? "pending" : "accepted")} loading={update.isPending}>
                {candidate.status === "accepted" ? t("card.accepted") : t("card.accept")}
              </Button>
              <Button full kind="ghost" icon="X" onClick={() => setStatus("rejected")} loading={update.isPending}>{t("card.reject")}</Button>
              <Button full kind="ghost" icon="Edit" onClick={() => setEditing(true)}>{t("card.edit")}</Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
