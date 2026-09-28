/* SymbolImpact — one changed symbol's downstream impact: its callers as
   file:line links (opens the PR's head_sha blob on GitHub) plus the
   endpoints and crons reachable through them, in separate labelled groups.
   The header is a collapsible <button> (open by default) so a PR with many
   changed symbols can be scanned by header alone; the caller list gets a
   left tree-guide border to read as a branch under the symbol. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "../../styles";

export function SymbolImpact({
  impact,
  repoFullName,
  headSha,
}: {
  impact: DownstreamImpact;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(true);
  return (
    <div style={s.symbolGroup}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t("toggle", { symbol: impact.symbol })}
        onClick={() => setOpen((v) => !v)}
        style={s.symbolHeaderButton}
      >
        <span style={s.symbolName}>
          {open ? <Icon.ChevronDown size={13} /> : <Icon.ChevronRight size={13} />}
          <Icon.Code size={13} />
          {impact.symbol}
        </span>
        <span style={s.callerCount}>{t("callerCount", { count: impact.callers.length })}</span>
      </button>

      {open && (
        <>
          <ul style={s.callerList}>
            {impact.callers.map((c) => {
              const href =
                repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, c.file, c.line) : undefined;
              return (
                <li key={`${c.file}:${c.line}:${c.name}`} style={s.callerItem}>
                  <Icon.CornerDownRight size={12} style={s.callerIcon} />
                  <MonoLink href={href}>
                    {c.file}:{c.line}
                  </MonoLink>
                  <span style={s.callerName}> · {c.name}</span>
                </li>
              );
            })}
          </ul>

          {(impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0) && (
            <div style={s.chipGroups}>
              {impact.endpoints_affected.length > 0 && (
                <div style={s.chipGroup}>
                  <span style={s.chipGroupLabel}>{t("endpoints")}</span>
                  <div style={s.chipRow}>
                    {impact.endpoints_affected.map((e) => (
                      <Badge key={e} icon="Globe" color="var(--info)" bg="var(--info-bg)" mono>
                        {e}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {impact.crons_affected.length > 0 && (
                <div style={s.chipGroup}>
                  <span style={s.chipGroupLabel}>{t("crons")}</span>
                  <div style={s.chipRow}>
                    {impact.crons_affected.map((c) => (
                      <Badge key={c} icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono>
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
