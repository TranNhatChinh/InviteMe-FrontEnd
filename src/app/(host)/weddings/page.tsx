import { WeddingList } from "@/features/weddings";
export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  // ?plan= comes from the pricing page: the couple picks which wedding the plan is for.
  const { plan } = await searchParams;
  return <WeddingList requestedPlan={typeof plan === "string" ? plan.toUpperCase() : undefined} />;
}
