import type { Metadata } from "next";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = {
  title: "Tổng quan kế hoạch — InviteMe",
  description: "Không gian chuẩn bị và quản lý các đám cưới của bạn trên InviteMe.",
};

export default function DashboardPage() {
  return <DashboardView />;
}
