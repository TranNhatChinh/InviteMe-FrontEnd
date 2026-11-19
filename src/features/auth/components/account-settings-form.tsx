"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { env } from "@/core/config/env";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/forms/form-field";
import { AccountAvatar } from "./account-avatar";
import { useLocale } from "@/i18n/language-context";
import { LanguageSwitcher } from "@/shared/components/language-switcher";
import { authApi } from "../api/auth.api";
import { currentUserKeys, useCurrentUser } from "../hooks/use-current-user";
import {
  createChangePasswordSchema,
  createProfileSchema,
  type ChangePasswordInput,
  type ProfileInput,
} from "../schemas/account-management.schema";

function validationMessage(error: unknown, fallback: string, t: (key: string) => string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 429) return t("rateLimitError");
  if (error.code === "network") return t("networkError");
  if (error.code === "validation") return t("validationError");
  return fallback;
}

export function AccountSettingsForm() {
  const { t } = useTranslation("settings");
  const { language } = useLocale();
  const deleteConfirmationPhrase = t("deleteConfirmationPhrase");
  const { api, session, queryClient } = useRuntime();
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [profileNotice, setProfileNotice] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteGoogleToken, setDeleteGoogleToken] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showGoogleError, setShowGoogleError] = useState(false);

  const validationMessages = useMemo(
    () => ({
      emailMax: t("validation.emailMax"),
      emailInvalid: t("validation.emailInvalid"),
      passwordMin: t("validation.passwordMin"),
      passwordMax: t("validation.passwordMax"),
      lowercase: t("validation.lowercase"),
      uppercase: t("validation.uppercase"),
      digit: t("validation.digit"),
      special: t("validation.special"),
      confirmRequired: t("validation.confirmRequired"),
      passwordMismatch: t("validation.mismatch"),
      currentPasswordRequired: t("validation.passwordRequired"),
      passwordMustDiffer: t("validation.passwordMustDiffer"),
      nameRequired: t("validation.nameRequired"),
      nameMax: t("validation.nameMax"),
      phoneInvalid: t("validation.phoneInvalid"),
      avatarUrlInvalid: t("validation.avatarUrlInvalid"),
    }),
    [t],
  );
  const profileValidationSchema = useMemo(
    () => createProfileSchema(validationMessages),
    [validationMessages],
  );
  const passwordValidationSchema = useMemo(
    () => createChangePasswordSchema(validationMessages),
    [validationMessages],
  );

  const profileForm = useForm<ProfileInput>({
    resolver: zodResolver(profileValidationSchema),
    defaultValues: { displayName: "", phone: "", avatarUrl: "" },
  });
  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(passwordValidationSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const previewName = useWatch({ control: profileForm.control, name: "displayName" });
  const previewUrl = useWatch({ control: profileForm.control, name: "avatarUrl" });

  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      displayName: user.displayName,
      phone: user.phone ?? "",
      avatarUrl: user.avatarUrl ?? "",
    });
  }, [user, profileForm]);

  async function saveProfile(values: ProfileInput) {
    setProfileNotice("");
    setSavingProfile(true);
    try {
      const updated = await authApi.updateProfile(api, {
        displayName: values.displayName,
        phone: values.phone || null,
        avatarUrl: values.avatarUrl || null,
      });
      queryClient.setQueryData(currentUserKeys.me(), updated);
      setProfileNotice(t("profileSaved"));
    } catch (error) {
      profileForm.setError("root.server", {
        message: validationMessage(error, t("saveFailed"), t),
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(values: ChangePasswordInput) {
    passwordForm.clearErrors("root");
    setChangingPassword(true);
    try {
      await authApi.changePassword(api, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      session.clear();
      queryClient.clear();
      passwordForm.reset();
      router.replace("/login?passwordChanged=1");
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.CurrentPassword) {
        passwordForm.setError("currentPassword", { message: t("currentPasswordIncorrect") });
        return;
      }
      const message =
        error instanceof ApiError && error.status === 401
          ? t("currentPasswordOrSessionInvalid")
          : validationMessage(error, t("changePasswordFailed"), t);
      passwordForm.setError("root.server", { message });
    } finally {
      setChangingPassword(false);
    }
  }

  async function deleteAccount() {
    setDeleteError("");
    if (deleteConfirmation !== deleteConfirmationPhrase) {
      setDeleteError(t("deleteConfirmMismatch", { phrase: deleteConfirmationPhrase }));
      return;
    }
    if (!deletePassword && !deleteGoogleToken) {
      setDeleteError(t("deletePasswordRequired"));
      return;
    }
    if (!window.confirm(t("deleteAccountConfirm"))) return;

    setDeleting(true);
    try {
      await authApi.deleteAccount(
        api,
        deletePassword ? { password: deletePassword } : { googleIdToken: deleteGoogleToken },
      );
      session.clear();
      queryClient.clear();
      router.replace("/login?accountDeleted=1");
    } catch (error) {
      const code = error instanceof ApiError ? error.backendCode : undefined;
      const message =
        code === "ACTIVE_WEDDING_OWNED"
          ? t("activeWeddingOwned")
          : code === "ADMIN_CANNOT_SELF_DELETE"
            ? t("adminCannotDelete")
            : code === "PASSWORD_REQUIRED" || code === "GOOGLE_TOKEN_REQUIRED"
              ? t("reauthRequired")
              : error instanceof ApiError && error.status === 401
                ? t("credentialsInvalid")
                : validationMessage(error, t("deleteFailed"), t);
      setDeleteError(message);
      setDeleteGoogleToken("");
    } finally {
      setDeleting(false);
    }
  }

  function handleGoogleReauth(response: CredentialResponse) {
    if (!response.credential) {
      setShowGoogleError(true);
      return;
    }
    setDeleteGoogleToken(response.credential);
    setDeletePassword("");
    setShowGoogleError(false);
    setDeleteError("");
  }

  if (isLoading || !user) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("accountLoading")}
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <section
        aria-labelledby="language-heading"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-7"
      >
        <div>
          <h2 id="language-heading" className="text-xl font-semibold">
            {t("languageHeading")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("languageDescription")}</p>
        </div>
        <LanguageSwitcher />
        <span className="sr-only" aria-live="polite">
          {language === "en" ? t("languageEnglish") : t("languageVietnamese")}
        </span>
      </section>
      <section
        aria-labelledby="profile-heading"
        className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7"
      >
        <div>
          <h2 id="profile-heading" className="text-xl font-semibold">
            {t("profileHeading")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("profileDescription")}</p>
        </div>
        <form onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-5" noValidate>
          <FormField control={profileForm.control} name="displayName" label={t("profileName")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                aria-invalid={field["aria-invalid"]}
                aria-describedby={field["aria-describedby"]}
                maxLength={50}
                disabled={savingProfile}
              />
            )}
          </FormField>
          <div className="space-y-2">
            <label htmlFor="account-email" className="text-sm font-medium">
              {t("emailLabel")}
            </label>
            <Input
              id="account-email"
              type="email"
              value={user.email}
              readOnly
              aria-readonly="true"
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">{t("profileEmail")}</p>
          </div>
          <FormField control={profileForm.control} name="phone" label={t("profilePhone")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="0912345678"
                aria-invalid={field["aria-invalid"]}
                aria-describedby={field["aria-describedby"]}
                disabled={savingProfile}
              />
            )}
          </FormField>
          <FormField control={profileForm.control} name="avatarUrl" label={t("avatarUrl")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                type="url"
                placeholder="https://example.com/avatar.jpg"
                aria-invalid={field["aria-invalid"]}
                aria-describedby={field["aria-describedby"]}
                disabled={savingProfile}
              />
            )}
          </FormField>
          <div className="flex items-center gap-4 rounded-xl bg-muted/50 p-4">
            <AccountAvatar
              name={previewName || user.displayName}
              imageUrl={previewUrl || null}
              size="large"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("avatarPreview")}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{t("avatarHint")}</p>
            </div>
          </div>
          {profileForm.formState.errors.root?.server && (
            <p role="alert" className="text-sm text-destructive">
              {profileForm.formState.errors.root.server.message}
            </p>
          )}
          {profileNotice && (
            <p role="status" className="text-sm text-emerald-700">
              {profileNotice}
            </p>
          )}
          <Button type="submit" disabled={savingProfile || !env.apiUrl}>
            {savingProfile ? t("saving") : t("saveProfile")}
          </Button>
        </form>
      </section>

      <section
        aria-labelledby="password-heading"
        className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7"
      >
        <div>
          <h2 id="password-heading" className="text-xl font-semibold">
            {t("changePassword")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("changePasswordHint")}</p>
        </div>
        <form onSubmit={passwordForm.handleSubmit(changePassword)} className="space-y-5" noValidate>
          <FormField
            control={passwordForm.control}
            name="currentPassword"
            label={t("currentPassword")}
          >
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                type="password"
                autoComplete="current-password"
                aria-invalid={field["aria-invalid"]}
                aria-describedby={field["aria-describedby"]}
                disabled={changingPassword}
              />
            )}
          </FormField>
          <FormField control={passwordForm.control} name="newPassword" label={t("newPassword")}>
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                type="password"
                autoComplete="new-password"
                aria-invalid={field["aria-invalid"]}
                aria-describedby={field["aria-describedby"]}
                disabled={changingPassword}
              />
            )}
          </FormField>
          <FormField
            control={passwordForm.control}
            name="confirmPassword"
            label={t("confirmNewPassword")}
          >
            {(field) => (
              <Input
                {...field}
                value={String(field.value ?? "")}
                type="password"
                autoComplete="new-password"
                aria-invalid={field["aria-invalid"]}
                aria-describedby={field["aria-describedby"]}
                disabled={changingPassword}
              />
            )}
          </FormField>
          <p className="text-xs leading-5 text-muted-foreground">{t("passwordRequirements")}</p>
          {passwordForm.formState.errors.root?.server && (
            <p role="alert" className="text-sm text-destructive">
              {passwordForm.formState.errors.root.server.message}
            </p>
          )}
          <Button type="submit" disabled={changingPassword || !env.apiUrl}>
            {changingPassword ? t("updating") : t("changePassword")}
          </Button>
        </form>
      </section>

      <section
        aria-labelledby="delete-heading"
        className="space-y-5 rounded-2xl border border-destructive/40 bg-card p-5 shadow-sm sm:p-7"
      >
        <div>
          <h2 id="delete-heading" className="text-xl font-semibold text-destructive">
            {t("deleteAccount")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("deleteAccountDescription")}
          </p>
        </div>
        {user.role === "ADMIN" ? (
          <p className="text-sm text-muted-foreground">{t("adminCannotDelete")}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="delete-password" className="text-sm font-medium">
                {t("currentPassword")}
              </label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => {
                  setDeletePassword(event.target.value);
                  setDeleteGoogleToken("");
                }}
                disabled={deleting}
              />
              <p className="text-xs text-muted-foreground">{t("googleOnlyReauth")}</p>
            </div>
            {!env.googleClientId && (
              <p className="text-xs text-muted-foreground">{t("googleNotConfigured")}</p>
            )}
            {env.googleClientId && (
              <div className="space-y-2">
                <GoogleLogin
                  onSuccess={handleGoogleReauth}
                  onError={() => setShowGoogleError(true)}
                />
                {deleteGoogleToken && (
                  <p role="status" className="text-sm text-emerald-700">
                    {t("googleVerified")}
                  </p>
                )}
                {showGoogleError && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("googleVerificationFailed")}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="delete-confirmation" className="text-sm font-medium">
                {t("deleteConfirmationLabel", { phrase: deleteConfirmationPhrase })}
              </label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                disabled={deleting}
              />
            </div>
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !env.apiUrl}
              onClick={() => void deleteAccount()}
            >
              {deleting ? t("deleting") : t("deleteAccountAction")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
