import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = await params;
  redirect(`/weddings/${encodeURIComponent(weddingId)}/check-in?view=overview`);
}
