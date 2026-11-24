import { PublicInvitationStudio } from "@/app/_components/public-invitation-studio";
import { WeddingTemplateStudio } from "@/app/_components/wedding-template-studio";
import { z } from "zod";
import { cookies } from "next/headers";
import { defaultLanguage, isLanguage, languageCookieName } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string;
    preview?: string;
    weddingId?: string;
    wording?: string;
  }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const languageCookie = cookieStore.get(languageCookieName)?.value;
  const language = isLanguage(languageCookie) ? languageCookie : defaultLanguage;
  const t = createI18nInstance(language).getFixedT(language, "screens");
  if (params.weddingId) {
    const id = z.uuid().safeParse(params.weddingId);
    if (!id.success) return <main id="main-content">{t("invalidWedding")}</main>;
    return (
      <WeddingTemplateStudio
        key={`${id.data}:${params.template ?? "blank"}:${params.preview ?? "0"}`}
        weddingId={id.data}
        template={params.template}
        preview={params.preview === "1"}
        wording={params.wording === "1"}
      />
    );
  }
  return (
    <PublicInvitationStudio
      key={`${params.template ?? "blank"}:${params.preview === "1" ? "preview" : "edit"}`}
      template={params.template}
      preview={params.preview === "1"}
    />
  );
}
