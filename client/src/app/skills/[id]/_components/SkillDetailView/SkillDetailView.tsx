"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../components/skill-type-badge";
import { ApiError } from "../../../../../lib/api";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersioningTab } from "./_components/VersioningTab";
import { TABS, type SkillTabKey } from "./constants";
import { s } from "./styles";

type SkillDetailViewProps = {
  skill: Skill | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  tab: SkillTabKey;
  onTab: (tab: SkillTabKey) => void;
};

export function SkillDetailView({ skill, isLoading, isError, error, refetch, tab, onTab }: SkillDetailViewProps) {
  const t = useTranslations("skills");

  if (isError && error instanceof ApiError && error.status === 404) {
    return (
      <div className="dd-skill-detail" style={s.state}>
        <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="dd-skill-detail" style={s.state}>
        <ErrorState fullScreen body={t("detail.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <>
      {isLoading || !skill ? (
        <div className="dd-skill-detail" style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={220} />
        </div>
      ) : (
        <div className="dd-skill-detail" style={s.wrap}>
          <div style={s.header}>
            <Link href="/skills" className="dd-skill-mobile-back" style={s.mobileBack} aria-label={t("page.crumbSkills")}>
              <Icon.ChevronLeft size={14} />
              {t("page.crumbSkills")}
            </Link>
            <Icon.Sparkles size={18} style={s.icon} />
            <h1 className="mono" style={s.name}>
              {skill.name}
            </h1>
            <SkillTypeBadge type={skill.type} label={t(`type.${skill.type}`)} />
            <Badge icon="GitCommit" mono>
              {t("card.version", { version: skill.version })}
            </Badge>
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
    </>
  );
}
