import type { ReactNode } from "react";
import { AdminAuthGuard, UserMenu } from "@/features/auth";
import { AdminPortalShell } from "@/features/admin";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthGuard>
      <AdminPortalShell account={<UserMenu />}>{children}</AdminPortalShell>
    </AdminAuthGuard>
  );
}
