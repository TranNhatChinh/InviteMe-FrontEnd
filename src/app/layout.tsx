import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Providers } from "./providers";
import "./globals.css";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";
export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");

  return {
    title: { default: "InviteMe", template: "%s | InviteMe" },
    description: t("meta.root.description"),
    icons: {
      icon: "/images/brand/inviteme-mark.png",
      apple: "/images/brand/inviteme-mark.png",
    },
  };
}
export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const savedLanguage = cookieStore.get(languageCookieName)?.value;
  const language = isLanguage(savedLanguage) ? savedLanguage : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "ui");

  return (
    <html lang={language}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-4"
        >
          {t("layout.skipToContent")}
        </a>
        <Providers initialLanguage={language}>{children}</Providers>
      </body>
    </html>
  );
}
