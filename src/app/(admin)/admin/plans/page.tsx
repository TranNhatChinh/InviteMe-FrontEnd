import type { Metadata } from "next";
import { AdminPlans } from "@/features/admin";

export const metadata: Metadata = {
  title: "Quản lý Gói cước & Đơn hàng — Admin InviteMe",
};

export default function AdminPlansPage() {
  return <AdminPlans />;
}
