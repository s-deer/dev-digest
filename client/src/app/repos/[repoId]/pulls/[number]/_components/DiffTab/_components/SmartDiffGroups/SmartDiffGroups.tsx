/* SmartDiffGroups — the Files changed tab in Smart order: the PR's files
   grouped core → tests → wiring → docs → boilerplate (server-ordered,
   empty groups already omitted), each behind a sticky GroupHeader with a
   collapse toggle. docs/boilerplate start collapsed; the rest open. Each
   group's files render through the same DiffViewer as Original order, so
   inline findings/comments behave identically either way. */
"use client";

import React from "react";
import type { PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi, type DiffTarget } from "@/components/diff-viewer";
import { COLLAPSED_BY_DEFAULT } from "../../constants";
import { GroupHeader } from "./_components/GroupHeader";
import { buildGroupedFiles } from "./helpers";
import { s } from "./styles";

export function SmartDiffGroups({
  groups,
  files,
  commenting,
  findings,
  target,
}: {
  groups: SmartDiffGroup[];
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
  /** Deep-link target: its group starts expanded even if collapsed by default. */
  target?: DiffTarget;
}) {
  const grouped = React.useMemo(() => buildGroupedFiles(groups, files), [groups, files]);
  const [collapsed, setCollapsed] = React.useState<Set<SmartDiffRole>>(
    () => {
      const initial = new Set<SmartDiffRole>(COLLAPSED_BY_DEFAULT);
      const targetGroup = target && grouped.find((g) => g.entries.some((e) => e.file.path === target.file));
      if (targetGroup) initial.delete(targetGroup.role);
      return initial;
    },
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
                target={target}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
