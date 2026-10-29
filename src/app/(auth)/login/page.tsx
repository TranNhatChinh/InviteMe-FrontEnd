import type { Metadata } from "next";
import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth";
import { SessionLoading } from "@/shared/feedback/session-loading";

export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");
  return { title: t("meta.login.title"), description: t("meta.login.description") };
}

// LoginForm uses useSearchParams() — Suspense boundary is required in Next.js
// App Router when a Client Component reads searchParams.
export default function Page() {
  return (
    <Suspense fallback={<SessionLoading />}>
      <LoginForm />
    </Suspense>
  );
}
