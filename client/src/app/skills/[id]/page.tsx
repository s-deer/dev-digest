/* /skills/:id — skill editor: Config / Preview / Versioning. Tab lives in ?tab=. */
"use client";

import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { useSkill } from "../../../lib/hooks/skills";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";
import { SkillDetailView } from "./_components/SkillDetailView";
import { TAB_KEYS, type SkillTabKey } from "./_components/SkillDetailView/constants";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("skills");
  const search = useSearchParams();
  const router = useRouter();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const requested = search.get("tab") ?? "";
  const tab: SkillTabKey = (TAB_KEYS as readonly string[]).includes(requested) ? (requested as SkillTabKey) : "config";
  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? "…" },
  ];

  return (
    <AppShell crumb={crumb}>
      <SkillsWorkspace activeId={id} activeTab={tab}>
        <SkillDetailView
          skill={skill}
          isLoading={isLoading}
          isError={isError}
          error={error}
          refetch={refetch}
          tab={tab}
          onTab={(next) => router.replace(`/skills/${id}?tab=${next}`)}
        />
      </SkillsWorkspace>
    </AppShell>
  );
}
