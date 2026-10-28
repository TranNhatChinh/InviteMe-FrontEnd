import { notFound } from "next/navigation";
import { PublicTemplateCatalog } from "@/app/_components/public-template-catalog";

export default async function TemplateCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (category !== "invite" && category !== "story") notFound();
  return <PublicTemplateCatalog category={category} />;
}
