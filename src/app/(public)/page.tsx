import { PublicLandingHero, LandingContent } from "@/features/public";
import { PricingSection } from "@/app/_components/pricing-section";

export default function HomePage() {
  return (
    <>
      <PublicLandingHero />
      <LandingContent pricingSection={<PricingSection embedded />} />
    </>
  );
}
