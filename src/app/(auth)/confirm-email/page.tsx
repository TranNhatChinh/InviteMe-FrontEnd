import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";
import { ConfirmEmailForm } from "@/features/auth";
export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");
  return {
    title: t("meta.confirmEmail.title"),
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}
export default async function Page() {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");
  return (
    <Suspense fallback={<p role="status">{t("auth.openingConfirmLink")}</p>}>
      <ConfirmEmailForm />
    </Suspense>
  );
}
