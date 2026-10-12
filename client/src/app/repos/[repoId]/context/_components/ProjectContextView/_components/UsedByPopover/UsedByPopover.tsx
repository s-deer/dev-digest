/* UsedByPopover — "Used by N agents" trigger and a focus-managed list of the
   agents, each marked direct or via a skill. Renders nothing when N is 0. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { ProjectDocumentUser } from "@devdigest/shared";

const wrap: React.CSSProperties = { position: "relative" };
const panel: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 6px)",
  zIndex: 20,
  minWidth: 260,
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-modal)",
  outline: "none",
};
const list: React.CSSProperties = { listStyle: "none", margin: "8px 0", padding: 0, display: "grid", gap: 6, fontSize: 13 };

export function UsedByPopover({
  path,
  users,
  count,
  onOpen,
  failed,
}: {
  path: string;
  /** `undefined` while lazily loading (list rows); the panel then shows a loading line. */
  users: ProjectDocumentUser[] | undefined;
  /** Known agent count when `users` is not loaded yet (the listing's `used_by_agents`). */
  count?: number;
  onOpen?: () => void;
  failed?: boolean;
}) {
  const t = useTranslations("context");
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.querySelector("button")?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Agents can use a doc directly and through skills: count distinct agents.
  const agentCount = users ? new Set(users.map((u) => u.agent_id)).size : (count ?? 0);
  if (agentCount === 0) return null;

  return (
    <div style={wrap} ref={triggerRef}>
      <Button kind="ghost" size="sm" icon="Users" aria-haspopup="dialog" aria-expanded={open} onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
      >
        {t("page.usedBy", { count: agentCount })}
      </Button>
      {open && (
        <div ref={panelRef} role="dialog" tabIndex={-1} aria-label={t("page.usedByTitle", { path })} style={panel}>
          {!users ? (
            <p style={{ ...list, margin: "8px 0" }} role="status">
              {failed ? t("page.previewLoadError") : t("page.usedByLoading")}
            </p>
          ) : (
          <ul style={list}>
            {users.map((u) => (
              <li key={`${u.agent_id}:${u.via}:${u.skill_name ?? ""}`} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <Link href={`/agents/${u.agent_id}`} style={{ color: "var(--accent-text)" }}>
                  {u.agent_name}
                </Link>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {u.via === "direct" ? t("page.direct") : t("page.viaSkill", { skill: u.skill_name ?? "" })}
                </span>
              </li>
            ))}
          </ul>
          )}
          <Button kind="ghost" size="sm" onClick={close}>
            {t("page.usedByClose")}
          </Button>
        </div>
      )}
    </div>
  );
}
