import { WeddingTemplateStudio } from "@/app/_components/wedding-template-studio";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ weddingId: string }>;
  searchParams: Promise<{ template?: string; preview?: string; wording?: string; import?: string }>;
}) {
  const { weddingId } = await params;
  const options = await searchParams;
  return (
    <WeddingTemplateStudio
      key={`${weddingId}:${options.template ?? "blank"}:${options.preview ?? "0"}:${options.import ?? "0"}`}
      weddingId={weddingId}
      template={options.template}
      preview={options.preview === "1"}
      wording={options.wording === "1"}
      imported={options.import === "1"}
    />
  );
}
