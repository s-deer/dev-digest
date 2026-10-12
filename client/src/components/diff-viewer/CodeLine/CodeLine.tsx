/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { topSeverity, type DiffFindingsApi } from "../findings";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, sevLabelFor, sevStripeFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { FindingComment } from "../FindingComment";
import { useReducedMotion } from "../useReducedMotion";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  lineFindings,
  findings,
  highlighted,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  lineFindings: FindingRecord[];
  findings?: DiffFindingsApi;
  /** Deep-link target line: pulses once (static tint under reduced motion). */
  highlighted?: boolean;
}) {
  const t = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const reduced = useReducedMotion();

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const topSev = topSeverity(lineFindings);
  const sevColor = topSev ? SEV[topSev].c : undefined;
  const SevIcon = topSev ? Icon[SEV[topSev].icon] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={lineRowFor(ln.kind, highlighted, reduced)}
        data-new-line={ln.kind !== "del" ? ln.newNo : undefined}
      >
        {topSev && sevColor && <span aria-hidden="true" style={sevStripeFor(sevColor)} />}
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {topSev && sevColor && SevIcon && (
          <span style={sevLabelFor(sevColor)}>
            <SevIcon size={11} aria-hidden="true" />
            {t(`smartDiff.lineLabel.${topSev}`)}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}

      {findings && findings.show && lineFindings.length > 0 && (
        <div style={cs.thread}>
          {lineFindings.map((f) => (
            <FindingComment
              key={f.id}
              finding={f}
              onAction={(action) => findings.onAction(f.id, action)}
              pending={findings.pending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
