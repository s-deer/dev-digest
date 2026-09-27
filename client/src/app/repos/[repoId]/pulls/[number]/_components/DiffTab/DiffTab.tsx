"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { diffTotals } from "./helpers";
import { useDiffFindings } from "./useDiffFindings";
import { OrderToggle, type DiffOrder } from "./_components/OrderToggle";
import { SmartDiffGroups } from "./_components/SmartDiffGroups";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // One toggle covers both GitHub comments and findings, and defaults to
  // shown — a review's findings should be visible under their line right away.
  const [show, setShow] = React.useState(true);
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  const { findingsApi, reviewed, findingsCount } = useDiffFindings(prId, show);

  // Smart Diff turns on only once the PR's files have loaded — before that,
  // the route has nothing to group. A disabled query stays `isPending`
  // forever, never `isLoading` (client/INSIGHTS.md), so the fallback below
  // branches on `isLoading`/`isError`, not `isPending`.
  const filesLoaded = files.length > 0;
  const { data: smartDiff, isLoading: smartLoading, isError: smartError } = useSmartDiff(prId, filesLoaded);
  const showSmart = order === "smart" && filesLoaded && !smartLoading && !smartError && !!smartDiff;

  const commentCount = comments?.length ?? 0;
  const toggleCount = commentCount + findingsCount;
  const totals = React.useMemo(() => diffTotals(files), [files]);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: show,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShow(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          toggleCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={show ? "EyeOff" : "Eye"}
              onClick={() => setShow((v) => !v)}
            >
              {show ? t("smartDiff.hideComments") : t("smartDiff.showComments")} ({toggleCount})
            </Button>
          ) : undefined
        }
      >
        {t("smartDiff.reviewerOrdered")}
      </SectionLabel>
      <div style={s.toolbar}>
        <div style={s.toolbarLeft}>
          <span style={s.summary}>
            {t("smartDiff.summaryLine", { files: filesCount })}
            <span className="mono tnum" style={s.summaryAdd}>
              +{totals.add}
            </span>{" "}
            <span className="mono tnum" style={s.summaryDel}>
              −{totals.del}
            </span>
          </span>
          {!reviewed && <span style={s.noReview}>{t("smartDiff.noReviewYet")}</span>}
        </div>
        <OrderToggle order={order} onChange={setOrder} />
      </div>
      {showSmart && smartDiff ? (
        <SmartDiffGroups groups={smartDiff.groups} files={files} commenting={commenting} findings={findingsApi} />
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingsApi} />
      )}
    </section>
  );
}
