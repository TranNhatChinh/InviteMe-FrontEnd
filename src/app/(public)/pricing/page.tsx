import type { Metadata } from "next";
import { PricingSection } from "@/app/_components/pricing-section";

export const metadata: Metadata = {
  title: "Bảng giá & Gói dịch vụ — InviteMe",
  description: "Bảng giá các gói thiệp cưới online và quản lý tiệc cưới trọn gói của InviteMe.",
};

export default function PricingPage() {
  return <PricingSection />;
}
