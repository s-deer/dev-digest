"use client";

import React from "react";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useTranslations } from "next-intl";
import { filterSkills } from "../SkillsView/helpers";
import { SkillSidebarCard } from "./_components/SkillSidebarCard";
import { s } from "./styles";

export function SkillsSidebar({
  skills,
  isLoading,
  isError,
  refetch,
  activeId,
  onSelect,
  onToggle,
  onCreateDialog,
  onImportDialog,
}: {
  skills: Skill[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  activeId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onCreateDialog: () => void;
  onImportDialog: () => void;
}) {
  const t = useTranslations("skills");
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills ?? [], search);

  return (
    <aside className="dd-skills-sidebar" style={s.sidebar}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h1 style={s.title}>{t("page.heading")}</h1>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: onCreateDialog },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: onImportDialog },
            ]}
          />
        </div>
        <TextInput value={search} onChange={setSearch} placeholder={t("page.searchPlaceholder")} aria-label={t("page.searchPlaceholder")} />
      </div>
      <div style={s.list} aria-live="polite">
        {isLoading && (
          <>
            <Skeleton height={84} />
            <Skeleton height={84} />
            <Skeleton height={84} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && (skills ?? []).length === 0 && (
          <EmptyState icon="Sparkles" title={t("page.empty.title")} body={t("page.empty.body")} cta={t("page.empty.cta")} onCta={onCreateDialog} />
        )}
        {!isLoading && !isError && (skills ?? []).length > 0 && list.length === 0 && <p style={s.noMatch}>{t("page.noMatch")}</p>}
        {!isLoading && !isError && list.map((skill) => (
          <SkillSidebarCard
            key={skill.id}
            skill={skill}
            active={skill.id === activeId}
            onSelect={() => onSelect(skill.id)}
            onToggle={(enabled) => onToggle(skill.id, enabled)}
          />
        ))}
      </div>
    </aside>
  );
}
