import { PublicLandingHero, LandingContent } from "@/features/public";
import { PricingTable } from "@/features/plans";

export default function HomePage() {
  return (
    <>
      <PublicLandingHero />
      <LandingContent pricingSection={<PricingTable embedded />} />
    </>
  );
}
