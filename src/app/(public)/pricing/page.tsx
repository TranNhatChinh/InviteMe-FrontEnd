import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PricingSection } from "@/app/_components/pricing-section";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";

export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "plans");
  return {
    title: t("meta.pricingTitle"),
    description: t("meta.pricingDescription"),
  };
}

export default function PricingPage() {
  return <PricingSection />;
}
