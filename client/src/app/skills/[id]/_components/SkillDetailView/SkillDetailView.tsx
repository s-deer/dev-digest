"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { AppShell } from "../../../../../components/app-shell";
import { SkillTypeBadge } from "../../../../../components/skill-type-badge";
import { ApiError } from "../../../../../lib/api";
import { useSkill } from "../../../../../lib/hooks/skills";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersioningTab } from "./_components/VersioningTab";
import { TABS, type SkillTabKey } from "./constants";
import { s } from "./styles";

export function SkillDetailView({ id, tab, onTab }: { id: string; tab: SkillTabKey; onTab: (tab: SkillTabKey) => void }) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? "…" },
  ];

  if (isError && error instanceof ApiError && error.status === 404) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
      </AppShell>
    );
  }
  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen body={t("detail.loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {isLoading || !skill ? (
        <div style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={220} />
        </div>
      ) : (
        <div style={s.wrap}>
          <div style={s.header}>
            <Link href="/skills" style={s.back} aria-label={t("page.crumbSkills")}>
              <Icon.ChevronLeft size={14} />
            </Link>
            <h1 className="mono" style={s.name}>
              {skill.name}
            </h1>
            <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
            <Badge icon="GitCommit" mono>
              {t("card.version", { version: skill.version })}
            </Badge>
            <Badge icon="Cpu">{t("card.agents", { count: skill.agent_count })}</Badge>
          </div>
          <div style={s.tabs}>
            <Tabs
              tabs={TABS.map((item) => ({ key: item.key, label: t(item.labelKey), icon: item.icon }))}
              value={tab}
              onChange={(key) => onTab(key as SkillTabKey)}
              pad="0 24px"
            />
          </div>
          <div style={s.body}>
            {/* Remount when the body version changes (save, restore) so the form starts from it. */}
            {tab === "config" && <ConfigTab key={skill.version} skill={skill} />}
            {tab === "preview" && <PreviewTab skill={skill} />}
            {tab === "versioning" && <VersioningTab skill={skill} />}
          </div>
        </div>
      )}
    </AppShell>
  );
}
