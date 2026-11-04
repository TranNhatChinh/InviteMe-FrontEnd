"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { env } from "@/core/config/env";
import { createWeddingSlugSchema, normalizeWeddingSlug } from "../schemas/wedding.schema";
import { checkWeddingSlug } from "../api/wedding.api";
import { weddingKeys } from "../api/wedding.keys";
import { Input } from "@/shared/ui/input";
// eslint-disable-next-line architecture/boundaries -- Wedding setup gates slug edits using the plan entitlement from the plans feature.
import { FeatureLimitNotice, planEntitlementState, useWeddingPlan } from "@/features/plans";
import { usePermission } from "@/shared/components/permission-guard";

export function WeddingSlugField({
  value,
  onChange,
  weddingId,
  initialSlug,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  weddingId?: string;
  initialSlug?: string;
  error?: string;
}) {
  const { t } = useTranslation("weddings");
  const { t: tPlans } = useTranslation("plans");
  const { api } = useRuntime();
  const { isOwner } = usePermission();
  const plan = useWeddingPlan(weddingId ?? "", Boolean(weddingId));
  const slugGate = plan.data && !plan.isError ? planEntitlementState(plan.data, "customSlug") : null;
  const customSlugBlocked = Boolean(weddingId && (plan.isPending || plan.isError || !plan.data || slugGate?.locked));
  const slugSchema = useMemo(
    () =>
      createWeddingSlugSchema({
        min: t("validation.slugMin"),
        max: t("validation.slugMax"),
        pattern: t("validation.slugPattern"),
        reserved: t("validation.slugReserved"),
      }),
    [t],
  );
  const normalized = normalizeWeddingSlug(value);
  const valid = slugSchema.safeParse(normalized).success;
  const unchanged = Boolean(weddingId && normalized === initialSlug);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    if (!valid || unchanged) return;
    const timer = window.setTimeout(() => setDebounced(normalized), 500);
    return () => window.clearTimeout(timer);
  }, [normalized, valid, unchanged]);
  const availability = useQuery({
    queryKey: weddingKeys.slug(debounced, weddingId),
    queryFn: ({ signal }) => checkWeddingSlug(api, debounced, weddingId, signal),
    enabled: Boolean(debounced) && debounced === normalized,
    staleTime: 20_000,
    retry: false,
  });
  const baseUrl = env.appUrl || (typeof window === "undefined" ? "" : window.location.origin);
  const checking =
    valid && !unchanged && (!debounced || debounced !== normalized || availability.isFetching);
  const unavailable = valid && !unchanged && availability.data?.available === false;
  const available = valid && !unchanged && availability.data?.available === true;
  const statusMessage = unchanged
    ? t("slug.current")
    : !valid
      ? ""
      : checking
        ? t("slug.checking")
        : availability.isError
          ? t("slug.checkFailed")
          : available
            ? t("slug.available")
            : unavailable
              ? t("slug.unavailable")
              : "";
  const statusTone =
    unavailable || (!unchanged && availability.isError)
      ? "text-destructive"
      : "text-success-foreground";

  return (
    <div className="space-y-2">
      <label htmlFor="wedding-slug" className="text-sm font-medium">
        {t("slug.label")} <span aria-hidden="true">*</span>
      </label>
      <div className="flex min-w-0 items-center overflow-hidden rounded-xl border border-border bg-card transition focus-within:border-primary-hover focus-within:ring-2 focus-within:ring-ring">
        <span className="shrink-0 border-r border-border bg-muted px-3 py-3 text-sm text-muted-foreground">
          /wedding/
        </span>
        <Input
          id="wedding-slug"
          value={value}
          required
          aria-required="true"
          readOnly={customSlugBlocked}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          onBlur={() => onChange(normalized)}
          autoComplete="off"
          maxLength={80}
          aria-invalid={Boolean(error || (valid && availability.data?.available === false))}
          aria-describedby="wedding-slug-help wedding-slug-status wedding-slug-error"
          className="h-12 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 read-only:cursor-not-allowed read-only:bg-muted/40"
          placeholder="minh-lan-2026"
        />
      </div>
      <p id="wedding-slug-help" className="text-xs leading-5 text-muted-foreground">
        {t("slug.help")}
      </p>
      {weddingId && plan.isError && (
        <FeatureLimitNotice
          status="unavailable"
          title={tPlans("gate.unknownTitle")}
          description={tPlans("gate.unknownDescription")}
          retryLabel={tPlans("gate.retry")}
          onRetry={() => void plan.refetch()}
        />
      )}
      {slugGate?.locked && plan.data && !plan.isError && (
        <FeatureLimitNotice
          title={tPlans("gate.notIncludedTitle", {
            feature: tPlans("gate.features.customSlug"),
          })}
          description={
            isOwner
              ? tPlans("gate.notIncludedOwnerDescription", {
                  feature: tPlans("gate.features.customSlug"),
                  planName: plan.data.planName,
                })
              : tPlans("gate.contactOwner", {
                  feature: tPlans("gate.features.customSlug"),
                  planName: plan.data.planName,
                })
          }
          variant="compact"
          upgradeHref={isOwner ? `/weddings/${encodeURIComponent(weddingId ?? "")}/plan` : undefined}
          upgradeLabel={isOwner ? tPlans("gate.viewPlans") : undefined}
        />
      )}
      {baseUrl && valid && (
        <p className="break-all text-xs text-muted-foreground">
          {t("slug.preview", { url: `${baseUrl}/wedding/${normalized}` })}
        </p>
      )}
      <p
        id="wedding-slug-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`flex min-h-5 items-center gap-2 text-sm ${statusTone}`}
      >
        {checking ? (
          <LoaderCircle
            className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : unavailable || (!unchanged && availability.isError) ? (
          <AlertCircle className="size-4" aria-hidden="true" />
        ) : available || unchanged ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : null}
        {statusMessage}
      </p>
      {error && (
        <p id="wedding-slug-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
