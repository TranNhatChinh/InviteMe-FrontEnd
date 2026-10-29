"use client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { env } from "@/core/config/env";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/forms/form-field";
import { createRegisterSchema, type RegisterInput } from "../schemas/register.schema";
import { authApi } from "../api/auth.api";
import { ConfirmationNotice } from "./confirmation-notice";
export function RegisterForm() {
  const { t } = useTranslation("auth");
  const { api } = useRuntime();
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const validationSchema = useMemo(
    () =>
      createRegisterSchema({
        nameRequired: t("validation.nameRequired"),
        nameMax: t("validation.nameMax"),
        emailMax: t("validation.emailMax"),
        emailInvalid: t("validation.emailInvalid"),
        passwordMin: t("validation.passwordMin"),
        passwordMax: t("validation.passwordMax"),
        lowercase: t("validation.lowercase"),
        uppercase: t("validation.uppercase"),
        digit: t("validation.digit"),
        special: t("validation.special"),
        confirmRequired: t("validation.confirmRequired"),
        mismatch: t("validation.mismatch"),
      }),
    [t],
  );
  const form = useForm<RegisterInput>({
    resolver: zodResolver(validationSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });
  async function submit(values: RegisterInput) {
    form.clearErrors("root");
    try {
      const account = await authApi.register(api, values);
      form.reset();
      setShowPassword(false);
      setRegisteredEmail(account.email);
    } catch (error) {
      if (error instanceof ApiError && error.backendCode === "DUPLICATE_ACCOUNT") {
        form.setError("email", { message: t("duplicateEmail") }, { shouldFocus: true });
        return;
      }
      const message =
        error instanceof ApiError && error.status === 429
          ? t("rateLimited")
          : error instanceof ApiError && error.code === "network"
            ? t("registerNetworkError")
            : error instanceof ApiError && error.code === "validation"
              ? t("registerFieldValidation")
              : t("registerFailed");
      form.setError("root.server", { message });
      if (error instanceof ApiError) {
        const fields: Record<string, "email" | "password" | "displayName"> = {
          Email: "email",
          email: "email",
          Password: "password",
          password: "password",
          DisplayName: "displayName",
          displayName: "displayName",
        };
        for (const key of Object.keys(error.fieldErrors)) {
          const field = fields[key];
          if (field) form.setError(field, { message: t("registerValidationFieldError") });
        }
      }
    }
  }
  if (registeredEmail) return <ConfirmationNotice email={registeredEmail} initialCooldown={60} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">{t("registerHeading")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("registerDescription")}</p>
      </div>
      <form
        onSubmit={form.handleSubmit(submit)}
        noValidate
        className="space-y-4"
        aria-busy={form.formState.isSubmitting}
      >
        <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
          <FormField control={form.control} name="displayName" label={t("displayName")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                autoComplete="name"
                maxLength={150}
                placeholder={t("ui:auth.namePlaceholder")}
              />
            )}
          </FormField>
          <FormField control={form.control} name="email" label={t("email")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                type="email"
                autoComplete="email"
                maxLength={255}
                placeholder="you@example.com"
              />
            )}
          </FormField>
          <FormField control={form.control} name="password" label={t("password")}>
            {(field) => (
              <div className="relative">
                <Input
                  {...field}
                  aria-describedby={[field["aria-describedby"], "register-password-help"]
                    .filter(Boolean)
                    .join(" ")}
                  value={String(field.value ?? "")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={128}
                  className="pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            )}
          </FormField>
          <p id="register-password-help" className="text-xs leading-5 text-muted-foreground">
            {t("passwordHelp")}
          </p>
          <FormField control={form.control} name="confirmPassword" label={t("confirmPassword")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
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
        {!env.apiUrl && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("registrationNotReady")}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting || !env.apiUrl}
        >
          {form.formState.isSubmitting ? t("creatingAccount") : t("register")}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("alreadyHaveAccount")}{" "}
        <Link href="/login" className="font-medium text-primary underline underline-offset-4">
          {t("login")}
        </Link>
      </p>
    </div>
  );
}
