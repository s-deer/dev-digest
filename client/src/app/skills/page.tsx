"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { SkillEmptyPanel } from "./_components/SkillEmptyPanel";
import { SkillsWorkspace } from "./_components/SkillsWorkspace";

export default function SkillsPage() {
  const t = useTranslations("skills");

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <SkillsWorkspace activeId={null}>
        <SkillEmptyPanel />
      </SkillsWorkspace>
    </AppShell>
  );
}
