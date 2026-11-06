import type { Metadata } from "next";
import { fetchPublicWebsite, getWeddingWebsiteMetadata } from "@/features/weddings";
import { PublicWebsiteClient } from "./public-website-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return getWeddingWebsiteMetadata(slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const initial = await fetchPublicWebsite(slug);
  return <PublicWebsiteClient slug={slug} initial={initial} />;
}
