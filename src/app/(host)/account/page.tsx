import type { Metadata } from "next";
import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";
import { AccountSettingsForm } from "@/features/auth";
import { PageHeader } from "@/shared/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");
  return { title: t("meta.account.title") };
}

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeader title="Tài khoản" description="Quản lý hồ sơ và bảo mật tài khoản InviteMe." />
      <AccountSettingsForm />
    </div>
  );
}
