"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../hooks/use-current-user";
import { useLogout } from "../hooks/use-logout";
import { Button } from "@/shared/ui/button";
import { SessionLoading } from "@/shared/feedback/session-loading";

function AdminForbidden() {
  const { logout, isLoggingOut } = useLogout();
  const { t } = useTranslation("auth");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-primary/25 text-primary-foreground">
          <ShieldAlert aria-hidden="true" className="size-7" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("adminForbidden")}
        </p>
        <h1 className="mt-3 font-display text-3xl">{t("ui:adminGuard.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("ui:adminGuard.description")}
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild variant="outline">
            <Link href="/dashboard">{t("backToWorkspace")}</Link>
          </Button>
          <Button type="button" disabled={isLoggingOut} onClick={() => void logout()}>
            {isLoggingOut ? t("loggingOut") : t("logout")}
          </Button>
        </div>
      </section>
    </main>
  );
}

export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useTranslation("ui");
  const { user, isAuthenticated, isRestored, isLoading, isError, refetch } = useCurrentUser();

  useEffect(() => {
    if (isRestored && !isAuthenticated) router.replace("/admin/login");
  }, [isRestored, isAuthenticated, router]);

  if (!isRestored || (isAuthenticated && isLoading)) return <SessionLoading />;
  if (!isAuthenticated) return <SessionLoading />;
  if (isError && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <section className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="font-display text-2xl">{t("adminGuard.sessionFailed")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("adminGuard.sessionFailedHelp")}
          </p>
          <Button className="mt-5" onClick={() => void refetch()}>
            {t("common:retry")}
          </Button>
        </section>
      </main>
    );
  }
  if (user?.role !== "ADMIN") return <AdminForbidden />;

  return <>{children}</>;
}
