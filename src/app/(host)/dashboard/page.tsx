import type { Metadata } from "next";
import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";
import { DashboardView } from "./dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");
  return {
    title: t("meta.dashboard.title"),
    description: t("meta.dashboard.description"),
  };
}

export default function DashboardPage() {
  return <DashboardView />;
}
