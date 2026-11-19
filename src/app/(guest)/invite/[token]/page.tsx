import { GuestInvitation } from "@/features/template-studio";
import { GuestInvitationAccess } from "./guest-invitation-access";
import { GuestGiftOverlay } from "./guest-gift-overlay";
import { GuestRsvpOverlay } from "./guest-rsvp-overlay";
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <GuestInvitation token={token} />
      <GuestInvitationAccess token={token} />
      <GuestGiftOverlay token={token} />
      <GuestRsvpOverlay token={token} />
    </>
  );
}
