import { notFound } from "next/navigation";
import { PublicTemplateCatalog } from "@/app/_components/public-template-catalog";

export default async function TemplateCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ useTemplate?: string }>;
}) {
  const { category } = await params;
  if (category !== "invite" && category !== "story") notFound();
  const { useTemplate } = await searchParams;
  return <PublicTemplateCatalog category={category} initialTemplate={useTemplate} />;
}
