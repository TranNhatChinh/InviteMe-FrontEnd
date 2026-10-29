import type { Metadata } from "next";
import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";
import { AdminLoginForm } from "@/features/auth";
import { LanguageSwitcher } from "@/shared/components/language-switcher";

export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");
  return {
    title: t("meta.adminLogin.title"),
    description: t("meta.adminLogin.description"),
  };
}

export default function AdminLoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <LanguageSwitcher className="absolute right-5 top-5" />
      <AdminLoginForm />
    </main>
  );
}
