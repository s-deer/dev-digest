"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, MonoLink, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
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
    <article style={{ ...s.card, ...(candidate.status === "accepted" ? s.cardAccepted : {}) }}>
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
            <div style={{ marginTop: 9 }}><Chip>{t(`categories.${candidate.category}`)}</Chip></div>
            {candidate.rationale && <p style={s.rationale}>{candidate.rationale}</p>}
            <div style={s.evidence}>
              <div style={s.evidenceTop}>
                <MonoLink href={evidenceUrl}>{candidate.evidence_path}:{candidate.evidence_line ?? "?"}</MonoLink>
                <Button size="sm" kind="ghost" onClick={() => navigator.clipboard?.writeText(candidate.evidence_snippet)}>{t("card.copy")}</Button>
              </div>
              <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
            </div>
            <div style={s.confidence}>
              <ProgressBar value={percent} color={percent >= 85 ? "var(--good)" : "var(--warn)"} />
              <span className="mono tnum" style={{ color: percent >= 85 ? "var(--good)" : "var(--warn)", fontSize: 12 }}>{percent}%</span>
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div style={s.cardActions}>
          {candidate.status === "rejected" ? (
            <Button kind="secondary" onClick={() => setStatus("pending")} loading={update.isPending}>{t("card.undo")}</Button>
          ) : (
            <>
              <Button kind={candidate.status === "accepted" ? "primary" : "secondary"} onClick={() => setStatus(candidate.status === "accepted" ? "pending" : "accepted")} loading={update.isPending}>
                {candidate.status === "accepted" ? t("card.accepted") : t("card.accept")}
              </Button>
              <Button kind="danger" onClick={() => setStatus("rejected")} loading={update.isPending}>{t("card.reject")}</Button>
              <Button kind="ghost" onClick={() => setEditing(true)}>{t("card.edit")}</Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
