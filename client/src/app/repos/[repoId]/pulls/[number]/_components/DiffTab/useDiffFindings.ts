/* useDiffFindings — the Files changed tab's findings concern, colocated so
   DiffTab itself reads as intent (toolbar + order + which viewer to render).
   Wraps the latest review's kept findings + the accept/dismiss mutation into
   the DiffFindingsApi the diff-viewer components expect. */
"use client";

import React from "react";
import type { DiffFindingsApi } from "@/components/diff-viewer";
import { usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { latestReviewFindings, findingsByPath, hasReview } from "./helpers";

export function useDiffFindings(prId: string | null, show: boolean) {
  const { data: reviews } = usePrReviews(prId);
  const findingAction = useFindingAction();

  const findings = React.useMemo(() => latestReviewFindings(reviews ?? []), [reviews]);
  const byPath = React.useMemo(() => findingsByPath(findings), [findings]);
  const reviewed = hasReview(reviews ?? []);

  const findingsApi: DiffFindingsApi = {
    byPath,
    show,
    pending: findingAction.isPending,
    onAction: (findingId, action) => {
      findingAction.mutate({ findingId, action, prId: prId ?? undefined });
    },
  };

  return { findingsApi, reviewed, findingsCount: findings.length };
}
