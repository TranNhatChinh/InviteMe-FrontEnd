"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Heart, Mail, Users, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { formatDate, formatNumber } from "@/i18n/format";
import { useLocale } from "@/i18n/language-context";
import { adminApi } from "../api/admin.api";
import {
  InvitationDeliveryChart,
  PlanRevenueCharts,
  RsvpBreakdownChart,
  WeddingGrowthChart,
} from "./admin-dashboard-charts";

const quickLinks = [
  ["accounts", "/admin/users", "reviewAccounts", "ADMIN_USERS_VIEW"],
  ["weddings", "/admin/weddings", "searchWeddings", "ADMIN_WEDDINGS_VIEW"],
  ["templates", "/admin/templates", "manageTemplates", "ADMIN_TEMPLATES_VIEW"],
  ["storyTemplates", "/admin/story-templates", "manageStoryTemplates", "ADMIN_TEMPLATES_VIEW"],
  ["plans", "/admin/plans", "managePlans", "ADMIN_PLANS_MANAGE"],
  ["rolesPermissions", "/admin/access-control", "reviewPermissions", "ADMIN_RBAC_VIEW"],
  ["auditLogs", "/admin/audit-logs", "reviewAudit", "ADMIN_AUDIT_VIEW"],
] as const;
type Metric = { label: string; value: number; detail: string; icon: LucideIcon };
type RangePreset = "7" | "30" | "90" | "custom";

function vietnamToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function shiftIsoDate(value: string, days: number) {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function presetRange(days: "7" | "30" | "90") {
  const to = vietnamToday();
  return { preset: days as RangePreset, from: shiftIsoDate(to, 1 - Number(days)), to };
}

function dateDistance(from: string, to: string) {
  const [fromYear = 1970, fromMonth = 1, fromDay = 1] = from.split("-").map(Number);
  const [toYear = 1970, toMonth = 1, toDay = 1] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  );
}

function localBoundary(value: string, end: boolean) {
  return `${value}T${end ? "23:59:59.999" : "00:00:00"}+07:00`;
}

export function AdminDashboard() {
  const { t } = useTranslation("admin");
  const { t: auditT } = useTranslation("audit");
  const { language } = useLocale();
  const { api } = useRuntime();
  const [range, setRange] = useState(() => presetRange("30"));
  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: ({ signal }) => adminApi.dashboard(api, signal),
  });
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
  });
  const hasPlanPermission = permissions.data?.includes("ADMIN_PLANS_MANAGE") ?? false;
  const validRange = Boolean(
    range.from && range.to && range.from <= range.to && dateDistance(range.from, range.to) <= 365,
  );
  const bucket = range.from && range.to && dateDistance(range.from, range.to) > 30 ? "week" : "day";
  const analytics = useQuery({
    queryKey: ["admin-dashboard-analytics", range.from, range.to, bucket],
    queryFn: ({ signal }) =>
      adminApi.dashboardAnalytics(api, { from: range.from, to: range.to, bucket }, signal),
    enabled: validRange,
  });
  const planRevenue = useQuery({
    queryKey: ["admin-dashboard-plan-revenue", range.from, range.to],
    queryFn: ({ signal }) =>
      adminApi.planRevenue(
        api,
        {
          from: localBoundary(range.from, false),
          to: localBoundary(range.to, true),
        },
        signal,
      ),
    enabled: validRange && hasPlanPermission,
  });
  const plans = useQuery({
    queryKey: ["admin-dashboard-plans"],
    queryFn: ({ signal }) => adminApi.plans(api, signal),
    enabled: hasPlanPermission,
    staleTime: 60_000,
  });
  const recentActivity = useQuery({
    queryKey: ["admin-dashboard-recent-audit"],
    queryFn: ({ signal }) => adminApi.auditLogs(api, { page: 1, pageSize: 5 }, signal),
    enabled: permissions.data?.includes("ADMIN_AUDIT_VIEW") ?? false,
    staleTime: 30_000,
  });
  const visibleQuickLinks = quickLinks.filter(([, , , permission]) =>
    permissions.data?.includes(permission),
  );
  const updateRange = (preset: RangePreset) => {
    if (preset === "custom") setRange((current) => ({ ...current, preset }));
    else setRange(presetRange(preset));
  };
  return (
    <div className="space-y-8">
      <PageHeader title={t("dashboardTitle")} description={t("dashboardDescription")} />
      {dashboard.isPending && <LoadingState label={t("loadingOverview")} />}
      {dashboard.isError && (
        <ErrorState error={dashboard.error} retry={() => void dashboard.refetch()} />
      )}
      {dashboard.data && (
        <>
          <section
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label={t("platformMetrics")}
          >
            {(
              [
                {
                  label: "accounts",
                  value: dashboard.data.totalAccounts,
                  detail: `${formatNumber(dashboard.data.activeAccounts, language)} ${t("active")} · ${formatNumber(dashboard.data.suspendedAccounts, language)} ${t("suspended")}`,
                  icon: Users,
                },
                {
                  label: "weddings",
                  value: dashboard.data.totalWeddings,
                  detail: `${formatNumber(dashboard.data.draftWeddings, language)} ${t("draftCount")} · ${formatNumber(dashboard.data.publishedWeddings, language)} ${t("published")} · ${formatNumber(dashboard.data.closedWeddings, language)} ${t("closed")}`,
                  icon: CalendarDays,
                },
                {
                  label: "weddingGuests",
                  value: dashboard.data.activeGuests,
                  detail: t("activeGuestRecords"),
                  icon: Heart,
                },
                {
                  label: "invitationsSent",
                  value: dashboard.data.invitationsSent,
                  detail: t("successfulMessages"),
                  icon: Mail,
                },
              ] satisfies Metric[]
            ).map(({ label, value, detail, icon: Icon }) => (
              <article key={label} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm text-muted-foreground">{t(label)}</h2>
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </div>
                <p className="mt-4 text-3xl font-semibold tabular-nums">
                  {formatNumber(value, language)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
              </article>
            ))}
          </section>
          <section className="space-y-4" aria-labelledby="admin-analytics-title">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 id="admin-analytics-title" className="text-xl font-semibold">
                  {t("analyticsTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("analyticsDescription")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex rounded-full bg-muted/60 p-1"
                  aria-label={t("analyticsDateRange")}
                >
                  {(["7", "30", "90", "custom"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={range.preset === preset}
                      onClick={() => updateRange(preset)}
                      className={`min-h-9 rounded-full px-3 text-sm transition ${range.preset === preset ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {t(`analyticsRange.${preset}`)}
                    </button>
                  ))}
                </div>
                {range.preset === "custom" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor="admin-analytics-from">
                      {t("from")}
                    </label>
                    <input
                      id="admin-analytics-from"
                      type="date"
                      value={range.from}
                      onChange={(event) =>
                        setRange((current) => ({
                          ...current,
                          preset: "custom",
                          from: event.target.value,
                        }))
                      }
                      className="min-h-10 rounded-xl border bg-background px-3 text-sm"
                    />
                    <span aria-hidden="true" className="text-muted-foreground">
                      –
                    </span>
                    <label className="sr-only" htmlFor="admin-analytics-to">
                      {t("to")}
                    </label>
                    <input
                      id="admin-analytics-to"
                      type="date"
                      value={range.to}
                      onChange={(event) =>
                        setRange((current) => ({
                          ...current,
                          preset: "custom",
                          to: event.target.value,
                        }))
                      }
                      className="min-h-10 rounded-xl border bg-background px-3 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
            {range.from && range.to && !validRange && (
              <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {range.from > range.to ? t("analyticsInvalidRange") : t("analyticsRangeTooLarge")}
              </p>
            )}
            {analytics.isPending && validRange && <LoadingState label={t("analyticsLoading")} />}
            {analytics.isError && (
              <ErrorState error={analytics.error} retry={() => void analytics.refetch()} />
            )}
            {analytics.data && (
              <>
                <div className="grid gap-4 xl:grid-cols-2">
                  <article className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="font-semibold">{t("analyticsGrowthTitle")}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("analyticsGrowthDescription")}
                      </p>
                    </div>
                    <WeddingGrowthChart analytics={analytics.data} language={language} />
                  </article>
                  <article className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="font-semibold">{t("analyticsDeliveryTitle")}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("analyticsDeliveryDescription")}
                      </p>
                    </div>
                    <InvitationDeliveryChart analytics={analytics.data} language={language} />
                  </article>
                  <article className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="font-semibold">{t("analyticsRsvpTitle")}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("analyticsRsvpDescription")}
                      </p>
                    </div>
                    <RsvpBreakdownChart analytics={analytics.data} language={language} />
                  </article>
                  {hasPlanPermission && (
                    <article className="rounded-2xl border bg-card p-5 shadow-sm">
                      <div className="mb-4">
                        <h3 className="font-semibold">{t("analyticsPlansTitle")}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("analyticsPlansDescription")}
                        </p>
                      </div>
                      {planRevenue.isPending || plans.isPending ? (
                        <LoadingState label={t("analyticsLoadingPlans")} />
                      ) : planRevenue.isError ? (
                        <ErrorState
                          error={planRevenue.error}
                          retry={() => void planRevenue.refetch()}
                        />
                      ) : plans.isError ? (
                        <ErrorState error={plans.error} retry={() => void plans.refetch()} />
                      ) : planRevenue.data && plans.data ? (
                        <PlanRevenueCharts
                          revenue={planRevenue.data}
                          plans={plans.data}
                          language={language}
                          from={range.from}
                          to={range.to}
                        />
                      ) : null}
                    </article>
                  )}
                </div>
                <div
                  className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                  aria-label={t("analyticsAlertsTitle")}
                >
                  <article className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("analyticsFailedInvitations")}
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {formatNumber(analytics.data.failedInvitations, language)}
                      </p>
                    </div>
                    {permissions.data?.includes("ADMIN_WEDDINGS_VIEW") && (
                      <Link
                        href="/admin/weddings"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {t("analyticsOpenWeddings")}
                      </Link>
                    )}
                  </article>
                  <article className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("analyticsDelayedInvitations")}
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {formatNumber(analytics.data.delayedInvitations, language)}
                      </p>
                    </div>
                    {permissions.data?.includes("ADMIN_WEDDINGS_VIEW") && (
                      <Link
                        href="/admin/weddings"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {t("analyticsOpenWeddings")}
                      </Link>
                    )}
                  </article>
                  {hasPlanPermission && planRevenue.data && (
                    <article className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t("analyticsPaymentsToReview")}
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {formatNumber(planRevenue.data.paymentsToReview, language)}
                        </p>
                      </div>
                      <Link
                        href="/admin/plans"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {t("managePlans")}
                      </Link>
                    </article>
                  )}
                </div>
              </>
            )}
          </section>
          <section
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            aria-label={t("adminAreas")}
          >
            {visibleQuickLinks.map(([titleKey, href, descriptionKey]) => (
              <Link
                key={href}
                href={href}
                className="group rounded-2xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{t(titleKey)}</h2>
                  <ArrowRight
                    className="size-4 text-primary transition group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(descriptionKey)}</p>
              </Link>
            ))}
          </section>
          {permissions.data?.includes("ADMIN_AUDIT_VIEW") && (
            <section className="space-y-3" aria-labelledby="admin-recent-activity">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="admin-recent-activity" className="text-lg font-semibold">
                    {t("recentActivity")}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t("recentActivityDescription")}</p>
                </div>
                <Link
                  href="/admin/audit-logs"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t("viewAuditLog")}
                </Link>
              </div>
              {recentActivity.isPending && <LoadingState label={t("loadingAuditSummary")} />}
              {recentActivity.isError && (
                <ErrorState
                  error={recentActivity.error}
                  retry={() => void recentActivity.refetch()}
                />
              )}
              {recentActivity.data &&
                (recentActivity.data.items.length ? (
                  <div className="divide-y rounded-2xl border bg-card">
                    {recentActivity.data.items.map((item) => (
                      <article
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div>
                          <p className="font-medium">
                            {auditT(`actions.${item.action}`, {
                              defaultValue: auditT("unknownAction"),
                            })}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.actorName ||
                              item.actorEmail ||
                              auditT(`actors.${item.actorType}`, {
                                defaultValue: auditT("actors.unknown"),
                              })}
                            {item.weddingTitle ? ` · ${item.weddingTitle}` : ""}
                          </p>
                        </div>
                        <time className="text-sm text-muted-foreground" dateTime={item.createdAt}>
                          {formatDate(item.createdAt, language, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </time>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
                    {t("noRecentActivity")}
                  </p>
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
