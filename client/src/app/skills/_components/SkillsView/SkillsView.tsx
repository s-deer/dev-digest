/* /skills — grid of skill cards; a card opens a side preview, "Add Skill"
   creates from scratch or imports a .md/.zip (preview → confirm → save). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { DeleteSkillModal } from "../DeleteSkillModal";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillFormModal, type SkillFormMode } from "../SkillFormModal";
import { SkillCard } from "./_components/SkillCard";
import { SkillPreviewDrawer } from "./_components/SkillPreviewDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

type Dialog =
  | { kind: "form"; mode: SkillFormMode }
  | { kind: "import" }
  | { kind: "delete"; skill: Skill }
  | null;

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<Dialog>(null);

  const list = filterSkills(skills ?? [], search);
  const selected = skills?.find((skill) => skill.id === selectedId) ?? null;
  const close = () => setDialog(null);
  const create = () => setDialog({ kind: "form", mode: { kind: "create" } });

  return (
    <>
      {dialog?.kind === "form" && <SkillFormModal mode={dialog.mode} onClose={close} />}
      {dialog?.kind === "import" && (
        <ImportSkillModal
          onClose={close}
          onContinue={(preview, filename) => setDialog({ kind: "form", mode: { kind: "import", preview, filename } })}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteSkillModal
          skill={dialog.skill}
          onClose={close}
          onDeleted={() => setSelectedId((id) => (id === dialog.skill.id ? null : id))}
        />
      )}
      {selected && !dialog && (
        <SkillPreviewDrawer
          skill={selected}
          onClose={() => setSelectedId(null)}
          onOpen={() => router.push(`/skills/${selected.id}`)}
          onEdit={() => setDialog({ kind: "form", mode: { kind: "edit", skill: selected } })}
          onDelete={() => setDialog({ kind: "delete", skill: selected })}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: create },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setDialog({ kind: "import" }) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={150} />
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && (skills ?? []).length === 0 && (
          <EmptyState icon="Sparkles" title={t("page.empty.title")} body={t("page.empty.body")} cta={t("page.empty.cta")} onCta={create} />
        )}
        {!isLoading && !isError && (skills ?? []).length > 0 && list.length === 0 && (
          <p style={s.noMatch}>{t("page.noMatch")}</p>
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                active={skill.id === selectedId}
                onOpen={() => setSelectedId(skill.id)}
                onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                onDelete={() => setDialog({ kind: "delete", skill })}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
