import type { Metadata } from "next";
import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";
import { AcceptCoHostInvitation } from "@/features/co-hosts";

export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");
  return {
    title: t("meta.coHostAccept.title"),
    description: t("meta.coHostAccept.description"),
  };
}

export default function Page() {
  return <AcceptCoHostInvitation />;
}
