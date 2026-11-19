"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Language } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { AdminDashboardAnalytics, AdminPlan, PlanRevenue } from "../api/admin.api";

const channelColors = {
  pending: "#D5A64A",
  accepted: "#8C7AB8",
  sent: "#7196C5",
  delivered: "#5F9B78",
  failed: "#D06B7D",
  other: "#A3A3A3",
} as const;

function bucketLabel(value: string, language: Language) {
  const date = new Date(`${value}T12:00:00+07:00`);
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function money(value: number, language: Language) {
  return new Intl.NumberFormat(language === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function SegmentedButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full px-3 text-sm transition ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

export function WeddingGrowthChart({
  analytics,
  language,
}: {
  analytics: AdminDashboardAnalytics;
  language: Language;
}) {
  const { t } = useTranslation("admin");
  const [seriesKey, setSeriesKey] = useState<"weddings" | "accounts">("weddings");
  const points = seriesKey === "weddings" ? analytics.weddingGrowth : analytics.accountGrowth;
  const max = Math.max(1, ...points.map((point) => point.count));
  const width = 720;
  const height = 220;
  const left = 42;
  const right = 16;
  const top = 16;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coords = points.map((point, index) => ({
    x: points.length < 2 ? left + plotWidth / 2 : left + (plotWidth * index) / (points.length - 1),
    y: top + plotHeight - (point.count / max) * plotHeight,
    ...point,
  }));
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const tickIndexes = new Set(
    points.length <= 6
      ? points.map((_, index) => index)
      : [
          0,
          Math.round((points.length - 1) / 3),
          Math.round(((points.length - 1) * 2) / 3),
          points.length - 1,
        ],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full bg-muted/60 p-1">
          <SegmentedButton
            active={seriesKey === "weddings"}
            label={t("analyticsNewWeddings")}
            onClick={() => setSeriesKey("weddings")}
          />
          <SegmentedButton
            active={seriesKey === "accounts"}
            label={t("analyticsNewAccounts")}
            onClick={() => setSeriesKey("accounts")}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {t("analyticsPeriodTotal", {
            count: formatNumber(
              points.reduce((sum, point) => sum + point.count, 0),
              language,
            ),
          })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 min-w-[540px] w-full"
          role="img"
          aria-label={t("analyticsTrendChart")}
        >
          {[0, 0.5, 1].map((ratio) => {
            const y = top + plotHeight * ratio;
            const value = Math.round(max * (1 - ratio));
            return (
              <g key={ratio}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  opacity="0.12"
                />
                <text
                  x={left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize="11"
                >
                  {formatNumber(value, language)}
                </text>
              </g>
            );
          })}
          {coords.length > 1 && (
            <polyline
              points={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {coords.map((point, index) => (
            <g key={point.bucket}>
              <circle cx={point.x} cy={point.y} r="4" fill="var(--primary)">
                <title>{`${bucketLabel(point.bucket, language)}: ${formatNumber(point.count, language)}`}</title>
              </circle>
              {tickIndexes.has(index) && (
                <text
                  x={point.x}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="11"
                >
                  {bucketLabel(point.bucket, language)}
                </text>
              )}
            </g>
          ))}
          {coords.length === 1 && (
            <text
              x={width / 2}
              y={top + plotHeight / 2}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="12"
            >
              {t("analyticsOnePoint")}
            </text>
          )}
        </svg>
      </div>
      {seriesKey === "weddings" && (
        <div className="rounded-xl bg-muted/35 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t("analyticsPublishedWebsiteRate")}</span>
            <strong>
              {formatNumber(analytics.publishedWebsites, language)} /{" "}
              {formatNumber(analytics.nonArchivedWeddings, language)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {analytics.nonArchivedWeddings
                  ? t("analyticsPublishedRatePercent", {
                      percent: Math.round(
                        (analytics.publishedWebsites / analytics.nonArchivedWeddings) * 100,
                      ),
                    })
                  : t("analyticsNoWeddings")}
              </span>
            </strong>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={t("analyticsPublishedWebsiteRate")}
            aria-valuemin={0}
            aria-valuemax={analytics.nonArchivedWeddings || 1}
            aria-valuenow={analytics.publishedWebsites}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${analytics.nonArchivedWeddings ? Math.min(100, (analytics.publishedWebsites / analytics.nonArchivedWeddings) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type DeliverySegment = keyof typeof channelColors;
const deliverySegments: DeliverySegment[] = [
  "pending",
  "accepted",
  "sent",
  "delivered",
  "failed",
  "other",
];

export function InvitationDeliveryChart({
  analytics,
  language,
}: {
  analytics: AdminDashboardAnalytics;
  language: Language;
}) {
  const { t } = useTranslation("admin");
  const [channel, setChannel] = useState<"ALL" | "EMAIL" | "SMS">("ALL");
  const grouped = useMemo(() => {
    const buckets = new Map<string, Record<DeliverySegment, number>>();
    for (const point of analytics.invitationDelivery) {
      if (channel !== "ALL" && point.channel !== channel) continue;
      const values = buckets.get(point.bucket) ?? {
        pending: 0,
        accepted: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        other: 0,
      };
      if (point.status === "PENDING" || point.status === "SENDING") values.pending += point.count;
      else if (point.status === "ACCEPTED") values.accepted += point.count;
      else if (point.status === "SENT") values.sent += point.count;
      else if (point.status === "DELIVERED") values.delivered += point.count;
      else if (point.status === "FAILED") values.failed += point.count;
      else values.other += point.count;
      buckets.set(point.bucket, values);
    }
    return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [analytics.invitationDelivery, channel]);
  const maximum = Math.max(
    1,
    ...grouped.map(([, values]) => deliverySegments.reduce((sum, key) => sum + values[key], 0)),
  );
  const tickIndexes = new Set(
    grouped.length <= 6
      ? grouped.map((_, index) => index)
      : [
          0,
          Math.round((grouped.length - 1) / 3),
          Math.round(((grouped.length - 1) * 2) / 3),
          grouped.length - 1,
        ],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full bg-muted/60 p-1">
          {(["ALL", "EMAIL", "SMS"] as const).map((item) => (
            <SegmentedButton
              key={item}
              active={channel === item}
              label={item === "ALL" ? t("analyticsAllChannels") : item}
              onClick={() => setChannel(item)}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t("analyticsDeliveryCreatedAtHint")}</span>
      </div>
      {grouped.length === 0 ||
      grouped.every(([, values]) => deliverySegments.every((key) => values[key] === 0)) ? (
        <p className="rounded-xl bg-muted/30 p-5 text-sm text-muted-foreground">
          {t("analyticsNoDeliveryData")}
        </p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex h-52 min-w-[560px] items-end gap-2 border-b border-border px-2">
            {grouped.map(([bucket, values], index) => {
              const total = deliverySegments.reduce((sum, key) => sum + values[key], 0);
              return (
                <div
                  key={bucket}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                >
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {total ? formatNumber(total, language) : ""}
                  </span>
                  <div
                    className="flex h-36 w-full max-w-8 flex-col justify-end overflow-hidden rounded-t-md bg-muted/40"
                    title={`${bucketLabel(bucket, language)} · ${formatNumber(total, language)}`}
                  >
                    {deliverySegments.map((segment) => {
                      const count = values[segment];
                      if (!count) return null;
                      return (
                        <div
                          key={segment}
                          style={{
                            height: `${Math.max(2, (count / maximum) * 144)}px`,
                            backgroundColor: channelColors[segment],
                          }}
                          aria-label={`${t(`analyticsDelivery.${segment}`)}: ${formatNumber(count, language)}`}
                          title={`${t(`analyticsDelivery.${segment}`)}: ${formatNumber(count, language)}`}
                        />
                      );
                    })}
                  </div>
                  <span className="h-4 whitespace-nowrap text-[10px] text-muted-foreground">
                    {tickIndexes.has(index) ? bucketLabel(bucket, language) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {deliverySegments.map((segment) => (
          <span
            key={segment}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: channelColors[segment] }}
            />
            {t(`analyticsDelivery.${segment}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

const rsvpColors: Record<string, string> = {
  ATTENDING: "#5F9B78",
  MAYBE: "#D5A64A",
  DECLINED: "#9B8591",
  NO_RESPONSE: "#D9879C",
};

export function RsvpBreakdownChart({
  analytics,
  language,
}: {
  analytics: AdminDashboardAnalytics;
  language: Language;
}) {
  const { t } = useTranslation("admin");
  const total = analytics.rsvpStatus.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("analyticsRsvpCurrentHint")}</p>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={t("analyticsRsvpBreakdown")}
      >
        {analytics.rsvpStatus.map((item) => (
          <span
            key={item.status}
            style={{
              width: `${total ? (item.count / total) * 100 : 0}%`,
              backgroundColor: rsvpColors[item.status] ?? "#A3A3A3",
            }}
            title={`${t(`analyticsRsvp.${item.status}`, { defaultValue: t("analyticsRsvp.other") })}: ${formatNumber(item.count, language)}`}
          />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[...analytics.rsvpStatus]
          .sort((a, b) => b.count - a.count)
          .map((item) => (
            <div
              key={item.status}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: rsvpColors[item.status] ?? "#A3A3A3" }}
                />
                <span className="truncate">
                  {t(`analyticsRsvp.${item.status}`, { defaultValue: t("analyticsRsvp.other") })}
                </span>
              </span>
              <strong className="shrink-0 tabular-nums">
                {formatNumber(item.count, language)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {total ? `${Math.round((item.count / total) * 100)}%` : "0%"}
                </span>
              </strong>
            </div>
          ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("analyticsRsvpDenominator", { count: formatNumber(total, language) })}
      </p>
    </div>
  );
}

export function PlanRevenueCharts({
  revenue,
  plans,
  language,
  from,
  to,
}: {
  revenue: PlanRevenue;
  plans: AdminPlan[];
  language: Language;
  from: string;
  to: string;
}) {
  const { t } = useTranslation("admin");
  const monthKeys: string[] = [];
  const [firstYear = 0, firstMonth = 0] = from.slice(0, 7).split("-").map(Number);
  const [lastYear = firstYear, lastMonth = firstMonth] = to.slice(0, 7).split("-").map(Number);
  if (firstYear > 0 && firstMonth > 0 && lastYear > 0 && lastMonth > 0) {
    for (
      let year = firstYear, month = firstMonth;
      year < lastYear || (year === lastYear && month <= lastMonth);
    ) {
      monthKeys.push(`${year}-${String(month).padStart(2, "0")}`);
      if (++month === 13) {
        year += 1;
        month = 1;
      }
    }
  }
  const monthAmounts = new Map(revenue.byMonth.map((row) => [row.key, row.amount]));
  const months = monthKeys.map((key) => ({ key, amount: monthAmounts.get(key) ?? 0 }));
  const maxRevenue = Math.max(1, ...months.map((row) => row.amount));
  const maxActive = Math.max(1, ...plans.map((plan) => plan.activeWeddings));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-3">
        <div>
          <h3 className="font-medium">{t("analyticsRevenueByMonth")}</h3>
          <p className="text-sm text-muted-foreground">{t("analyticsConfirmedRevenue")}</p>
        </div>
        <div className="flex h-48 items-end gap-3 overflow-x-auto border-b border-border px-2">
          {months.length ? (
            months.map((row) => (
              <div
                key={row.key}
                className="flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="text-[10px] text-muted-foreground">
                  {money(row.amount, language)}
                </span>
                <div
                  className="w-full max-w-10 rounded-t-md bg-primary/80"
                  style={{ height: `${Math.max(3, (row.amount / maxRevenue) * 128)}px` }}
                  title={`${row.key}: ${money(row.amount, language)}`}
                />
                <span className="h-4 whitespace-nowrap text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Ho_Chi_Minh",
                  }).format(new Date(`${row.key}-01T12:00:00+07:00`))}
                </span>
              </div>
            ))
          ) : (
            <p className="pb-6 text-sm text-muted-foreground">{t("analyticsNoRevenueData")}</p>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="font-medium">{t("analyticsPlanUsage")}</h3>
          <p className="text-sm text-muted-foreground">{t("analyticsActiveWeddingsByPlan")}</p>
        </div>
        {plans.length ? (
          <div className="space-y-3">
            {plans
              .slice()
              .sort((a, b) => b.activeWeddings - a.activeWeddings)
              .map((plan) => (
                <div key={plan.code} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{plan.name}</span>
                    <strong className="tabular-nums">
                      {formatNumber(plan.activeWeddings, language)}
                    </strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/75"
                      style={{ width: `${(plan.activeWeddings / maxActive) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("analyticsNoPlanData")}</p>
        )}
      </div>
    </div>
  );
}
