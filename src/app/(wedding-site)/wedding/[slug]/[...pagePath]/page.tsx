import { env } from "@/core/config/env";
import { publicWebsiteSchema } from "@/features/weddings";
import { PublicWebsiteClient } from "../public-website-client";

export default async function Page({ params }: { params: Promise<{ slug: string; pagePath: string[] }> }) {
  const { slug, pagePath } = await params;
  let initial;
  if (env.apiUrl) {
    try {
      const response = await fetch(`${env.apiUrl.replace(/\/$/, "")}/public/weddings/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (response.ok) initial = publicWebsiteSchema.parse(await response.json());
    } catch { /* Client fetch handles an unavailable local API/certificate. */ }
  }
  return <PublicWebsiteClient slug={slug} pagePath={pagePath.join("/")} initial={initial} />;
}
