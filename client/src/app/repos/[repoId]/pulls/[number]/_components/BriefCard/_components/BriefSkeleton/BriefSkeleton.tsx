/* BriefSkeleton — two placeholder cards in a 1fr 1fr grid (design BriefSkeleton). */
"use client";

import React from "react";
import { Card, Skeleton } from "@devdigest/ui";
import { s } from "../../styles";

const BODY_WIDTHS = ["92%", "86%", "74%", "60%"] as const;
const FOOTER_WIDTHS = ["80%", "64%"] as const;
const CARDS = [0, 1] as const;

export function BriefSkeleton() {
  return (
    <div style={s.grid} aria-busy="true">
      {CARDS.map((c) => (
        <Card key={c}>
          <Skeleton style={s.skelHeading} />
          {BODY_WIDTHS.map((w) => (
            <Skeleton key={w} style={s.skelLine(w)} />
          ))}
          <div style={s.divider} />
          {FOOTER_WIDTHS.map((w) => (
            <Skeleton key={w} style={s.skelLine(w)} />
          ))}
        </Card>
      ))}
    </div>
  );
}
