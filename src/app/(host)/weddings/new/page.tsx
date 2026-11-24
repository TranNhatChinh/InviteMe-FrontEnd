import { WeddingSetupForm } from "@/features/weddings";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invitationTemplate?: string }>;
}) {
  const { invitationTemplate } = await searchParams;
  return <WeddingSetupForm invitationTemplate={invitationTemplate} />;
}
