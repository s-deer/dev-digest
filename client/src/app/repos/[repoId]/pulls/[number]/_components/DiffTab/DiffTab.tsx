"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { latestReviewFindings, findingsByPath, hasReview } from "./helpers";
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
  const { data: reviews } = usePrReviews(prId);
  const findingAction = useFindingAction();
  // One toggle covers both GitHub comments and findings, and defaults to
  // shown — a review's findings should be visible under their line right away.
  const [show, setShow] = React.useState(true);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  // Smart Diff turns on only once the PR's files have loaded — before that,
  // the route has nothing to group. A disabled query stays `isPending`
  // forever, never `isLoading` (client/INSIGHTS.md), so the fallback below
  // branches on `isLoading`/`isError`, not `isPending`.
  const filesLoaded = files.length > 0;
  const { data: smartDiff, isLoading: smartLoading, isError: smartError } = useSmartDiff(prId, filesLoaded);
  const showSmart = order === "smart" && filesLoaded && !smartLoading && !smartError && !!smartDiff;

  const commentCount = comments?.length ?? 0;
  const findings = React.useMemo(() => latestReviewFindings(reviews ?? []), [reviews]);
  const byPath = React.useMemo(() => findingsByPath(findings), [findings]);
  const toggleCount = commentCount + findings.length;
  const reviewed = hasReview(reviews ?? []);
  const totals = React.useMemo(
    () =>
      files.reduce(
        (acc, f) => ({ add: acc.add + (f.additions ?? 0), del: acc.del + (f.deletions ?? 0) }),
        { add: 0, del: 0 },
      ),
    [files],
  );

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

  const findingsApi: DiffFindingsApi = {
    byPath,
    show,
    pending: findingAction.isPending,
    onAction: (findingId, action) => {
      findingAction.mutate({ findingId, action, prId: prId ?? undefined });
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
          <span className="mono tnum" style={s.summary}>
            {t("smartDiff.summaryLine", { files: filesCount, add: totals.add, del: totals.del })}
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
