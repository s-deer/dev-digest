/* IntentSkeleton — 1:1 with DevDigest-design/screen_pr_detail.jsx
   BriefSkeleton (:65-72): two placeholder cards in a 1fr 1fr grid. Replaces
   the whole PR Brief grid (full width) while loading or regenerating. */
"use client";

import React from "react";
import { Card, Skeleton } from "@devdigest/ui";
import { SKELETON_FOOTER_WIDTHS, SKELETON_LINE_WIDTHS } from "../../constants";
import { s } from "../../styles";

function SkeletonCard() {
  return (
    <Card>
      <Skeleton style={s.skeletonHeading} />
      {SKELETON_LINE_WIDTHS.map((width) => (
        <Skeleton key={width} style={s.skeletonLine(width)} />
      ))}
      <div style={s.skeletonDivider} />
      {SKELETON_FOOTER_WIDTHS.map((width) => (
        <Skeleton key={width} style={s.skeletonLine(width)} />
      ))}
    </Card>
  );
}

export function IntentSkeleton() {
  return (
    <div style={s.skeletonGrid}>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
