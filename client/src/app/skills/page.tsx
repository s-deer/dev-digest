"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { SkillsView } from "./_components/SkillsView";

export default function SkillsPage() {
  const t = useTranslations("skills");

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <SkillsView />
    </AppShell>
  );
}
