import type { IconName } from "@devdigest/ui";

export const TABS = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "versioning", labelKey: "detail.tabs.versioning", icon: "History" },
] as const satisfies readonly { key: string; labelKey: string; icon: IconName }[];

export type SkillTabKey = (typeof TABS)[number]["key"];
export const TAB_KEYS: readonly SkillTabKey[] = TABS.map((tab) => tab.key);
