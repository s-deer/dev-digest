/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  lineKey,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionFindings, type DiffFindingsApi } from "../findings";
import { s, chevronFor, findingsDotFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { OutsideFindings } from "../OutsideFindings";

/** Stable "no findings" reference — `findings?.byPath.get(...) ?? []` would
   otherwise allocate a new empty array every render, defeating the `useMemo`
   below (its deps never look equal). */
const EMPTY: FindingRecord[] = [];

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line, read from the file's findings
   already grouped by line key (computed once per file, not once per line). */
function findingsForLine(ln: Line, byLineKey: Map<string, FindingRecord[]>): FindingRecord[] {
  if (byLineKey.size === 0) return EMPTY;
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    const list = byLineKey.get(key);
    if (list) out.push(...list);
  }
  return out.length > 0 ? out : EMPTY;
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
}) {
  const t = useTranslations("shell");
  const tReview = useTranslations("prReview");
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // This file's kept findings from the latest review, split into ones a
  // rendered line can anchor vs. ones the diff doesn't show (end-of-file block).
  const fileFindings = findings?.byPath.get(file.path) ?? EMPTY;
  const hasFindings = fileFindings.length > 0;
  const { matched, outside } = React.useMemo(() => {
    if (fileFindings.length === 0) return { matched: EMPTY, outside: EMPTY };
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionFindings(fileFindings, renderedKeys);
  }, [fileFindings, lines]);

  // `matched` grouped by the line key it anchors to, so each rendered line
  // does a map lookup instead of re-filtering the whole findings list.
  const findingsByLineKey = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const f of matched) {
      const key = lineKey("RIGHT", f.start_line);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [matched]);

  // Open by default when the file already has findings or is small enough
  // (AUTO_EXPAND_MAX_LINES). Findings arrive asynchronously after mount (the
  // review query resolves later), so also auto-open the first time this file
  // gains findings — but never fight a user's own manual toggle afterwards.
  const [open, setOpen] = React.useState(
    hasFindings || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES,
  );
  const userToggled = React.useRef(false);
  const hadFindings = React.useRef(hasFindings);
  React.useEffect(() => {
    if (!userToggled.current && hasFindings && !hadFindings.current) setOpen(true);
    hadFindings.current = hasFindings;
  }, [hasFindings]);

  const toggleOpen = () => {
    userToggled.current = true;
    setOpen((o) => !o);
  };

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched: matchedThreads, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={toggleOpen} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {hasFindings && (
          <span
            role="img"
            aria-label={tReview("runStatus.findings", { count: fileFindings.length })}
            title={tReview("runStatus.findings", { count: fileFindings.length })}
            style={findingsDotFor()}
          />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matchedThreads)}
                commenting={commenting}
                lineFindings={findingsForLine(ln, findingsByLineKey)}
                findings={findings}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.show && (
            <OutsideFindings findings={outside} onAction={findings.onAction} pending={findings.pending} />
          )}
        </div>
      )}
    </div>
  );
}
