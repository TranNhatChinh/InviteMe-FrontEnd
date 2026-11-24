import { PublicTemplateCatalog } from "@/app/_components/public-template-catalog";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ useTemplate?: string }>;
}) {
  const { useTemplate } = await searchParams;
  return <PublicTemplateCatalog initialTemplate={useTemplate} />;
}
