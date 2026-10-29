"use client";

import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";
import { mediaUrl, websiteTemplates, type LegacyWebsiteDocument } from "../api/website.api";
import { WEDDING_TIME_ZONE } from "../schemas/wedding.schema";

export function WebsiteRenderer({
  document,
  preview = false,
}: {
  document: LegacyWebsiteDocument;
  preview?: boolean;
}) {
  const { t } = useTranslation("public");
  const { language } = useLocale();
  const theme =
    websiteTemplates.find((item) => item.id === document.templateId) ?? websiteTemplates[0];
  const photo = mediaUrl(document.heroImageUrl);
  const editorial = document.templateId === "story-editorial-61";
  const soft = document.templateId === "story-garden-02" || document.templateId === "story-sage-53";
  const seaside = document.templateId === "story-seaside-01";
  const scarlet = document.templateId === "story-scarlet-39";
  const sage = document.templateId === "story-sage-53";
  const rawDate = document.eventAt ?? "";
  const date = Number.isNaN(Date.parse(rawDate))
    ? rawDate
    : formatDate(rawDate, language, {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: document.timeZoneId ?? WEDDING_TIME_ZONE,
      });
  return (
    <article
      style={{ background: theme.background, color: theme.color }}
      className="template-canvas min-h-screen overflow-hidden"
    >
      {preview && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          {t("previewMode")}
        </div>
      )}
      <header
        className={`mx-auto flex max-w-6xl items-center justify-between px-6 py-6 ${scarlet ? "border-b-2 border-current/30" : ""}`}
      >
        <span className="font-serif text-2xl">
          {document.partnerOne} &amp; {document.partnerTwo}
        </span>
        <span className="text-xs uppercase tracking-[0.25em]">Wedding Story</span>
      </header>
      <section
        className={`mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-12 md:pt-20 ${sage ? "max-w-4xl text-center" : "md:grid-cols-2"} ${editorial ? "md:[&>*:first-child]:order-2" : ""}`}
      >
        <div className={`space-y-7 ${seaside ? "border-l-4 border-current/30 pl-6" : ""}`}>
          <p className="text-sm uppercase tracking-[0.35em]">{t("weddingStory")}</p>
          <h1 className="font-serif text-5xl leading-tight md:text-7xl">{document.title}</h1>
          <p className="font-serif text-3xl">
            {document.partnerOne} <span className="italic">&</span> {document.partnerTwo}
          </p>
          <p className="text-lg">{date}</p>
        </div>
        <div
          className={`aspect-[4/5] overflow-hidden shadow-xl ${scarlet ? "rounded-none border-[16px] border-double border-current/50" : seaside ? "rounded-[48%_48%_12%_12%] border-8 border-white/70" : soft ? "rounded-[45%] border-8 border-white/70" : editorial ? "rounded-none border-8 border-white/70" : "rounded-t-full border-8 border-white/70"} ${sage ? "mx-auto w-full max-w-lg" : ""}`}
          style={{
            backgroundImage: photo ? `url(${JSON.stringify(photo).slice(1, -1)})` : undefined,
            backgroundColor: theme.color,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          role={photo ? "img" : undefined}
          aria-label={photo ? t("weddingPhoto") : undefined}
        />
      </section>
      {document.showStory && document.story?.trim() && (
        <section
          className={`mx-auto max-w-3xl px-6 py-20 ${editorial ? "text-left" : "text-center"}`}
        >
          <p className="mb-5 text-xs uppercase tracking-[0.3em]">{t("storySection")}</p>
          <h2 className="mb-8 font-serif text-4xl">{t("sharedJourney")}</h2>
          <p className="whitespace-pre-line text-lg leading-8">{document.story}</p>
        </section>
      )}
      {(document.timeline?.length ?? 0) > 0 && (
        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="mb-10 text-center font-serif text-4xl">{t("journeyTimeline")}</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {document.timeline?.map((item, index) => (
              <div
                key={`${index}-${item.title}`}
                className="rounded-2xl border border-current/20 bg-white/40 p-6"
              >
                <p className="text-xs uppercase tracking-widest">
                  {t("chapter", { number: index + 1 })}
                </p>
                <h3 className="mt-3 font-serif text-2xl">{item.title}</h3>
                <p className="mt-3 whitespace-pre-line leading-7">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {(document.gallery?.length ?? 0) > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-8 text-center font-serif text-4xl">{t("moments")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {document.gallery?.map((src, index) => (
              <div
                key={`${index}-${src}`}
                role="img"
                aria-label={t("galleryPhoto", { number: index + 1 })}
                className="aspect-square rounded-xl bg-cover bg-center"
                style={{ backgroundImage: `url(${mediaUrl(src)})` }}
              />
            ))}
          </div>
        </section>
      )}
      {document.showEvent && (
        <section className="bg-white/60 px-6 py-20 text-center">
          <p className="mb-5 text-xs uppercase tracking-[0.3em]">{t("seeYou")}</p>
          <h2 className="font-serif text-4xl">{document.venueName}</h2>
          <p className="mt-5 text-lg">{date}</p>
          <p className="mt-2 text-lg">{document.venueAddress}</p>
          {document.events?.map((event, index) => (
            <div
              key={`${index}-${event.name}`}
              className="mx-auto mt-8 max-w-lg border-t border-current/20 pt-6"
            >
              <h3 className="font-serif text-2xl">{event.name}</h3>
              <p className="mt-2">
                {Number.isNaN(Date.parse(event.startsAt))
                  ? event.startsAt
                  : formatDate(event.startsAt, language, {
                      dateStyle: "full",
                      timeStyle: "short",
                      timeZone: document.timeZoneId ?? WEDDING_TIME_ZONE,
                    })}
              </p>
              <p>{event.address}</p>
            </div>
          ))}
        </section>
      )}
      {document.contact?.trim() && (
        <footer className="px-6 py-12 text-center text-sm">
          {t("contactPrefix", { contact: document.contact })}
        </footer>
      )}
    </article>
  );
}
