/* IntentSkeleton — compact placeholder lines for the Intent block while it
   loads or regenerates. No heading and no Card: BriefGrid owns the Card. */
"use client";

import React from "react";
import { Skeleton } from "@devdigest/ui";
import { SKELETON_LINE_WIDTHS } from "../../constants";
import { s } from "../../styles";

export function IntentSkeleton() {
  return (
    <div>
      <Skeleton style={s.skeletonHeading} />
      {SKELETON_LINE_WIDTHS.map((width) => (
        <Skeleton key={width} style={s.skeletonLine(width)} />
      ))}
    </div>
  );
}
