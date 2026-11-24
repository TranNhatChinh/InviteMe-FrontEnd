import { PublicLandingHero, LandingContent } from "@/features/public";
import { PricingSection } from "@/app/_components/pricing-section";
import { InvitationCategoryPreview } from "@/app/_components/invitation-category-preview";

export default function HomePage() {
  return (
    <>
      <PublicLandingHero />
      <LandingContent
        pricingSection={<PricingSection embedded />}
        invitationPreview={<InvitationCategoryPreview />}
      />
    </>
  );
}
