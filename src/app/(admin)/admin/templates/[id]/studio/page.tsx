import { AdminInvitationStudio } from "@/app/_components/admin-invitation-studio";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminInvitationStudio id={id} />;
}
