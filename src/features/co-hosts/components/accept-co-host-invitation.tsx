"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, HeartHandshake, ShieldCheck } from "lucide-react";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import {
  acceptCoHostInvitation,
  isWeddingWideOnly,
  previewCoHostInvitation,
} from "../api/co-host.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";

const TOKEN_STORAGE_KEY = "inviteme.cohost-invitation-token";
const TOKEN_EVENT = "inviteme:cohost-invitation-token";
let volatileToken = "";

function readInvitationToken() {
  try {
    return (
      window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ??
      volatileToken ??
      new URLSearchParams(window.location.hash.slice(1)).get("token") ??
      ""
    );
  } catch {
    return "";
  }
}

function subscribeToInvitationToken(onChange: () => void) {
  window.addEventListener(TOKEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(TOKEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function invitationError(error: unknown, t: (key: string) => string) {
  if (!(error instanceof ApiError)) return t("accept.errors.generic");
  if (error.code === "network") return t("accept.errors.network");
  if (error.status === 401) return t("accept.errors.sessionExpired");
  if (error.status === 403) return t("accept.errors.emailMismatch");
  if (error.status === 404) return t("accept.errors.invalidInvite");
  return t("accept.errors.generic");
}

export function AcceptCoHostInvitation() {
  const { t } = useTranslation("cohost");
  const { language } = useLocale();
  const { api, session } = useRuntime();
  const token = useSyncExternalStore(subscribeToInvitationToken, readInvitationToken, () => "");
  const isRestored = useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.isRestored,
    () => false,
  );
  const isAuthenticated = useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.authenticated,
    () => false,
  );
  const [accepted, setAccepted] = useState(false);
  const [acceptedWeddingId, setAcceptedWeddingId] = useState("");
  const [acceptError, setAcceptError] = useState("");

  useEffect(() => {
    let fragmentToken = "";
    try {
      fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      if (window.location.hash) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
      volatileToken = fragmentToken;
      if (fragmentToken) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, fragmentToken);
    } catch {
      // Continue without a token if the browser blocks session storage.
    }
    window.dispatchEvent(new Event(TOKEN_EVENT));
  }, []);

  const preview = useQuery({
    queryKey: ["co-host-invitation-preview", token],
    queryFn: () => previewCoHostInvitation(api, token),
    enabled: Boolean(token && isRestored && isAuthenticated),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptCoHostInvitation(api, token),
    onSuccess: () => {
      setAcceptedWeddingId(preview.data?.weddingId ?? "");
      volatileToken = "";
      try {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // Storage can be disabled; the token is still removed from component state.
      }
      window.dispatchEvent(new Event(TOKEN_EVENT));
      setAccepted(true);
      setAcceptError("");
    },
    onError: (error) => setAcceptError(invitationError(error, t)),
  });

  if (accepted) {
    return (
      <div className="mx-auto max-w-xl space-y-6 rounded-3xl border bg-card p-7 text-center md:p-10">
        <BadgeCheck className="mx-auto size-12 text-emerald-600" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="font-display text-3xl">{t("accept.successTitle")}</h1>
          <p className="text-muted-foreground">{t("accept.successDescription")}</p>
        </div>
        {acceptedWeddingId && (
          <Button asChild>
            <Link href={`/weddings/${encodeURIComponent(acceptedWeddingId)}/overview`}>
              {t("accept.openWedding")}
            </Link>
          </Button>
        )}
        {!preview.data && (
          <Link className="text-sm text-primary underline" href="/dashboard">
            {t("accept.backToDashboard")}
          </Link>
        )}
      </div>
    );
  }

  if (!isRestored) return <LoadingState label={t("accept.checkingSession")} />;

  if (!token) {
    return (
      <InviteCard>
        <h1 className="font-display text-3xl">{t("accept.notFoundTitle")}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{t("accept.notFoundDescription")}</p>
      </InviteCard>
    );
  }

  if (!isAuthenticated) {
    const returnTo = "/co-host-invitations/accept";
    return (
      <InviteCard>
        <h1 className="font-display text-3xl">{t("accept.invitedTitle")}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{t("accept.invitedDescription")}</p>
        <Button asChild className="w-full">
          <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
            {t("accept.loginToContinue")}
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link
            href={`/register?returnTo=${encodeURIComponent(returnTo)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("accept.createAccount")}
          </Link>
        </Button>
      </InviteCard>
    );
  }

  if (preview.isPending) return <LoadingState label={t("accept.verifyingInvite")} />;
  if (preview.isError) {
    return (
      <InviteCard>
        <h1 className="font-display text-3xl">{t("accept.verificationFailed")}</h1>
        <p role="alert" className="text-sm text-destructive">
          {invitationError(preview.error, t)}
        </p>
        <Button variant="outline" onClick={() => void preview.refetch()}>
          {t("accept.retry")}
        </Button>
      </InviteCard>
    );
  }
  if (!preview.data) return <LoadingState label={t("accept.loadingDetails")} />;

  const hasInvalidCheckInScope = preview.data.grants.some(
    (grant) => isWeddingWideOnly(grant.permission) && !grant.weddingWide,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border bg-card p-6 md:p-9">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HeartHandshake className="size-7" aria-hidden="true" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-primary">
          {t("accept.inviteEyebrow")}
        </p>
        <h1 className="font-display text-3xl">{preview.data.weddingTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {t("accept.inviteTo", { email: preview.data.email })}
        </p>
      </div>
      <section className="space-y-3 rounded-2xl bg-muted/40 p-5">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />{" "}
          {t("accept.permissions")}
        </div>
        {preview.data.grants.length ? (
          <ul className="space-y-2">
            {preview.data.grants.map((grant) => (
              <li
                key={grant.permission}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm"
              >
                <span>{t(`permissions.${grant.permission}`)}</span>
                <Chip>
                  {isWeddingWideOnly(grant.permission) && !grant.weddingWide
                    ? t("accept.unsupportedGroupScope")
                    : grant.weddingWide
                      ? t("wholeWedding")
                      : t("accept.groupCount", { count: grant.groupIds.length })}
                </Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("accept.noPermissions")}</p>
        )}
        {preview.data.grants.some(
          (grant) => isWeddingWideOnly(grant.permission) && !grant.weddingWide,
        ) && (
          <p role="alert" className="text-sm text-destructive">
            {t("accept.legacyCheckInScope")}
          </p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          {t("accept.permissionDisclaimer")}
        </p>
      </section>
      {acceptError && (
        <p role="alert" className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive">
          {acceptError}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button
          disabled={accept.isPending || hasInvalidCheckInScope}
          onClick={() => accept.mutate()}
        >
          {accept.isPending
            ? t("accept.accepting")
            : hasInvalidCheckInScope
              ? t("accept.waitForScopeUpdate")
              : t("accept.acceptInvite")}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">{t("accept.later")}</Link>
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {t("accept.expiresAt", {
          date: formatDate(preview.data.expiresAt, language, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })}
      </p>
    </div>
  );
}

function InviteCard({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto max-w-xl space-y-5 rounded-3xl border bg-card p-7 md:p-10">
      {children}
    </section>
  );
}
