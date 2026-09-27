/* SmartDiffGroups — the Files changed tab in Smart order: the PR's files
   grouped core → tests → wiring → docs → boilerplate (server-ordered,
   empty groups already omitted), each behind a sticky GroupHeader with a
   collapse toggle. docs/boilerplate start collapsed; the rest open. Each
   group's files render through the same DiffViewer as Original order, so
   inline findings/comments behave identically either way. */
"use client";

import React from "react";
import type { PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { COLLAPSED_BY_DEFAULT } from "../../constants";
import { GroupHeader } from "./_components/GroupHeader";
import { buildGroupedFiles } from "./helpers";
import { s } from "./styles";

export function SmartDiffGroups({
  groups,
  files,
  commenting,
  findings,
}: {
  groups: SmartDiffGroup[];
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
}) {
  const grouped = React.useMemo(() => buildGroupedFiles(groups, files), [groups, files]);
  const [collapsed, setCollapsed] = React.useState<Set<SmartDiffRole>>(
    () => new Set(COLLAPSED_BY_DEFAULT),
  );

  const toggle = (role: SmartDiffRole) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  return (
    <div style={s.wrap}>
      {grouped.map((g) => {
        const open = !collapsed.has(g.role);
        const filesWithFindingsCount = g.entries.filter((e) => e.findingLines.length > 0).length;
        return (
          <div key={g.role} style={s.group}>
            <GroupHeader
              role={g.role}
              filesCount={g.entries.length}
              filesWithFindingsCount={filesWithFindingsCount}
              open={open}
              onToggle={() => toggle(g.role)}
            />
            {open && (
              <DiffViewer
                files={g.entries.map((e) => e.file)}
                commenting={commenting}
                findings={findings}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
