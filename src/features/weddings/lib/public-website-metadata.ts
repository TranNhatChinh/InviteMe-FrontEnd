import { cache } from "react";
import type { Metadata } from "next";
import { env } from "@/core/config/env";
import { publicWebsiteSchema } from "../api/website.api";
import { isStoryBuilderV4Document } from "../schemas/story-builder-v4.document";

export const fetchPublicWebsite = cache(async (slug: string) => {
  if (!env.apiUrl) return undefined;
  try {
    const response = await fetch(`${env.apiUrl.replace(/\/$/, "")}/public/weddings/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) return undefined;
    return publicWebsiteSchema.parse(await response.json());
  } catch {
    return undefined;
  }
});

function absoluteImage(source: string | undefined) {
  if (!source) return undefined;
  try {
    if (source.startsWith("/media/")) return env.apiUrl ? new URL(source, env.apiUrl).toString() : undefined;
    return new URL(source, env.appUrl ?? "https://www.inviteme.asia").toString();
  } catch {
    return undefined;
  }
}

function publicPath(slug: string, pagePath = "") {
  const suffix = pagePath ? `/${pagePath.split("/").map(encodeURIComponent).join("/")}` : "";
  return `/wedding/${encodeURIComponent(slug)}${suffix}`;
}

export async function getWeddingWebsiteMetadata(slug: string, pagePath = ""): Promise<Metadata> {
  const site = await fetchPublicWebsite(slug);
  const document = site?.document;
  const v4 = isStoryBuilderV4Document(document) ? document : undefined;
  const seo = v4?.seo;
  const hero = v4?.pages.flatMap(page => page.sections).find(section => section.type === "hero" && section.visible !== false);
  const heroContent = hero?.type === "hero" ? hero.content : undefined;
  const couple = [v4?.content.groom?.displayName ?? v4?.content.groom?.fullName, v4?.content.bride?.displayName ?? v4?.content.bride?.fullName].filter(Boolean);
  const title = seo?.title?.trim() || heroContent?.title?.trim() || (couple.length ? `${couple.join(" & ")} · Thiệp cưới InviteMe` : "Thiệp cưới trực tuyến · InviteMe");
  const description = seo?.description?.trim() || heroContent?.subtitle?.trim() || "Cùng chúng mình lưu giữ những khoảnh khắc đẹp và chia sẻ ngày vui với khách mời.";
  const image = absoluteImage(seo?.imageUrl || heroContent?.imageUrl || v4?.content.heroImageUrl);
  const path = publicPath(slug, pagePath);
  const metadataBase = new URL(env.appUrl ?? "https://www.inviteme.asia");
  const canonical = new URL(path, metadataBase).toString();
  return {
    metadataBase,
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", title, description, url: canonical, ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
  };
}
