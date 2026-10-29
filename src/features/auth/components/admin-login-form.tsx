"use client";

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ShieldCheck } from "lucide-react";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { createLoginSchema, type LoginInput } from "../schemas/login.schema";
import { authApi } from "../api/auth.api";
import { useCurrentUser, currentUserKeys } from "../hooks/use-current-user";
import { useLogout } from "../hooks/use-logout";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/forms/form-field";
import { BrandLogo } from "@/shared/components/brand-logo";
import { SessionLoading } from "@/shared/feedback/session-loading";

function errorMessage(error: unknown, t: (key: string) => string) {
  if (error instanceof ApiError && error.status === 429) return t("rateLimited");
  if (error instanceof ApiError && error.code === "network") return t("networkError");
  if (error instanceof ApiError && error.status === 403) return t("adminLoginInvalidSource");
  if (error instanceof ApiError && error.status === 401) return t("adminLoginDenied");
  return t("adminLoginFailed");
}

export function AdminLoginForm() {
  const { t } = useTranslation("auth");
  const { api, session, queryClient } = useRuntime();
  const router = useRouter();
  const { user, isAuthenticated, isRestored, isLoading } = useCurrentUser();
  const { logout, isLoggingOut } = useLogout();
  const validationSchema = useMemo(
    () =>
      createLoginSchema({
        emailMax: t("validation.emailMax"),
        emailInvalid: t("validation.emailInvalid"),
        passwordRequired: t("validation.passwordRequired"),
        passwordMax: t("validation.passwordMax"),
      }),
    [t],
  );
  const form = useForm<LoginInput>({
    resolver: zodResolver(validationSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (isRestored && isAuthenticated && user?.role === "ADMIN") router.replace("/admin");
  }, [isRestored, isAuthenticated, user, router]);

  async function submit(input: LoginInput) {
    form.clearErrors("root");
    try {
      const token = await authApi.adminLogin(api, input);
      session.setToken(token);
      const account = await authApi.me(api);
      if (account.role !== "ADMIN") {
        session.clear();
        form.setError("root.server", { message: t("notAdminAccount") });
        return;
      }
      queryClient.setQueryData(currentUserKeys.me(), account);
      router.replace("/admin");
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error, t) });
    }
  }

  if (!isRestored || (isAuthenticated && isLoading)) return <SessionLoading />;
  if (isAuthenticated && !isLoading && user && user.role !== "ADMIN") {
    return (
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <ShieldCheck className="mx-auto size-9 text-primary-foreground" aria-hidden="true" />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("adminForbidden")}
        </p>
        <h1 className="mt-2 font-display text-3xl">{t("notAdmin")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("adminForbiddenDescription")}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild variant="outline">
            <Link href="/dashboard">{t("backToWorkspace")}</Link>
          </Button>
          <Button type="button" disabled={isLoggingOut} onClick={() => void logout()}>
            {isLoggingOut ? t("loggingOut") : t("logout")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-9">
      <BrandLogo href="/" size="md" ariaLabel={t("ui:auth.homeAria")} />
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {t("adminGate")}
      </p>
      <h1 className="mt-2 font-display text-3xl">{t("adminLogin")}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("adminAccountOnly")}</p>

      <form
        onSubmit={form.handleSubmit(submit)}
        noValidate
        className="mt-7 space-y-5"
        aria-busy={form.formState.isSubmitting}
      >
        <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
          <FormField control={form.control} name="email" label={t("adminEmail")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                id="admin-login-email"
                type="email"
                autoComplete="username"
                maxLength={255}
                placeholder="admin@example.com"
              />
            )}
          </FormField>
          <FormField control={form.control} name="password" label={t("password")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                id="admin-login-password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
              />
            )}
          </FormField>
        </fieldset>
        {form.formState.errors.root?.server && (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.root.server.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("authenticating") : t("adminLogin")}
        </Button>
      </form>

      <Link
        href="/"
        className="mt-6 block text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("backToInviteMe")}
      </Link>
    </section>
  );
}
