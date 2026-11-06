import type { Metadata } from "next";
import { fetchPublicWebsite, getWeddingWebsiteMetadata } from "@/features/weddings";
import { PublicWebsiteClient } from "../public-website-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; pagePath: string[] }> }): Promise<Metadata> {
  const { slug, pagePath } = await params;
  return getWeddingWebsiteMetadata(slug, pagePath.join("/"));
}

export default async function Page({ params }: { params: Promise<{ slug: string; pagePath: string[] }> }) {
  const { slug, pagePath } = await params;
  const initial = await fetchPublicWebsite(slug);
  return <PublicWebsiteClient slug={slug} pagePath={pagePath.join("/")} initial={initial} />;
}
