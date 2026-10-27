"use client";

import Link from "next/link";
import { CalendarHeart, ExternalLink, HeartHandshake, PanelsTopLeft } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { usePermission } from "@/shared/components/permission-guard";
import {
  useWorkspaceContext,
  type WorkspaceNavigationIcon,
} from "@/shared/layout/workspace-context";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import type { WeddingPermission } from "@/core/auth/auth.types";
import { useRuntime } from "@/core/config/runtime";
import { getWeddingSetup } from "../api/wedding.api";
import { weddingKeys } from "../api/wedding.keys";
import { getWebsite } from "../api/website.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";

type WeddingSection = {
  slug: string;
  label: string;
  permission: WeddingPermission;
  group: string;
  icon: WorkspaceNavigationIcon;
  ownerOnly?: boolean;
  wideOnly?: boolean;
};

const navigationGroups: { label: string }[] = [
  { label: "Không gian cưới" },
  { label: "Khách mời & RSVP" },
  { label: "Tiệc cưới" },
  { label: "Quản lý" },
];

const sections: WeddingSection[] = [
  {
    slug: "overview",
    label: "Tổng quan",
    permission: "WEDDING_VIEW",
    group: "Không gian cưới",
    icon: "overview",
  },
  {
    slug: "website",
    label: "Website đám cưới",
    permission: "WEDDING_EDIT",
    group: "Không gian cưới",
    icon: "website",
    ownerOnly: true,
  },
  {
    slug: "guests",
    label: "Khách mời",
    permission: "GUEST_VIEW",
    group: "Khách mời & RSVP",
    icon: "users",
  },
  {
    slug: "invitations",
    label: "Thiệp mời",
    permission: "INVITATION_SEND",
    group: "Khách mời & RSVP",
    icon: "invitations",
  },
  {
    slug: "rsvp",
    label: "RSVP",
    permission: "RSVP_VIEW",
    group: "Khách mời & RSVP",
    icon: "rsvp",
  },
  {
    slug: "rsvp/reminders",
    label: "Nhắc RSVP",
    permission: "RSVP_VIEW",
    group: "Khách mời & RSVP",
    icon: "reminders",
    wideOnly: true,
  },
  {
    slug: "waitlist",
    label: "Danh sách chờ",
    permission: "RSVP_VIEW",
    group: "Khách mời & RSVP",
    icon: "waitlist",
  },
  {
    slug: "seating",
    label: "Sơ đồ bàn",
    permission: "SEATING_VIEW",
    group: "Tiệc cưới",
    icon: "seating",
  },
  {
    slug: "check-in",
    label: "Check-in",
    permission: "CHECKIN_MANAGE",
    group: "Tiệc cưới",
    icon: "checkin",
  },
  {
    slug: "gifts",
    label: "Quà mừng & lời chúc",
    permission: "GIFT_VIEW",
    group: "Tiệc cưới",
    icon: "gifts",
  },
  {
    slug: "thank-you",
    label: "Thư cảm ơn",
    permission: "GUEST_VIEW",
    group: "Quản lý",
    icon: "thank-you",
    ownerOnly: true,
  },
  {
    slug: "analytics",
    label: "Tổng quan check-in",
    permission: "RSVP_VIEW",
    group: "Tiệc cưới",
    icon: "analytics",
  },
  {
    slug: "audit-logs",
    label: "Nhật ký hoạt động",
    permission: "WEDDING_VIEW",
    group: "Quản lý",
    icon: "audit",
    ownerOnly: true,
  },
  {
    slug: "plan",
    label: "Gói dịch vụ",
    permission: "WEDDING_VIEW",
    group: "Quản lý",
    icon: "plans",
    ownerOnly: true,
  },
  {
    slug: "settings",
    label: "Cài đặt đám cưới",
    permission: "WEDDING_EDIT",
    group: "Quản lý",
    icon: "settings",
    ownerOnly: true,
  },
  {
    slug: "co-hosts",
    label: "Co-host",
    permission: "WEDDING_EDIT",
    group: "Quản lý",
    icon: "co-hosts",
    ownerOnly: true,
  },
];

function statusPresentation(status: string, isWebsiteStatus: boolean, t: (key: string) => string) {
  switch (status) {
    case "DRAFT":
      return {
        label: isWebsiteStatus ? t("unpublished") : t("preparing"),
        className: "bg-warning/45 text-warning-foreground",
      };
    case "PUBLISHED":
      return { label: t("published"), className: "bg-success/45 text-success-foreground" };
    case "UNPUBLISHED":
      return { label: t("temporarilyHidden"), className: "bg-petal text-muted-foreground" };
    default:
      return { label: status, className: "bg-petal text-foreground" };
  }
}

function formatEventDate(value: string | null, timeZone: string, language: "vi" | "en") {
  if (!value) return null;
  return formatDate(value, language, { dateStyle: "medium", timeZone });
}

function haveSameSidebarGroups(
  left: { label: string; items: { href: string; label: string; icon: string }[] }[],
  right: { label: string; items: { href: string; label: string; icon: string }[] }[],
) {
  return (
    left.length === right.length &&
    left.every(
      (group, groupIndex) =>
        group.label === right[groupIndex]?.label &&
        group.items.length === right[groupIndex]?.items.length &&
        group.items.every(
          (item, itemIndex) =>
            item.href === right[groupIndex]?.items[itemIndex]?.href &&
            item.label === right[groupIndex]?.items[itemIndex]?.label &&
            item.icon === right[groupIndex]?.items[itemIndex]?.icon,
        ),
    )
  );
}

export function WeddingNavigation({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("navigation");
  const { language } = useLocale();
  const { api } = useRuntime();
  const { can, isOwner, isWeddingWide } = usePermission();
  const { setWedding, setWeddingNavigation } = useWorkspaceContext();
  const weddingPath = `/weddings/${encodeURIComponent(weddingId)}`;
  const wedding = useQuery({
    queryKey: weddingKeys.detail(weddingId),
    queryFn: ({ signal }) => getWeddingSetup(api, weddingId, signal),
  });
  const website = useQuery({
    queryKey: ["website", weddingId],
    queryFn: ({ signal }) => getWebsite(api, weddingId, signal),
    enabled: isOwner,
  });
  const available = useMemo(
    () =>
      sections.filter(
        (section) =>
          can(section.permission) &&
          (!section.ownerOnly || isOwner) &&
          (!section.wideOnly || isWeddingWide(section.permission)),
      ),
    [can, isOwner, isWeddingWide],
  );
  const sidebarGroups = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          label: group.label,
          items: available
            .filter((section) => section.group === group.label)
            .map((section) => ({
              href: `${weddingPath}/${section.slug}`,
              label: section.label,
              icon: section.icon,
            })),
        }))
        .filter((group) => group.items.length > 0),
    [available, weddingPath],
  );
  const status = wedding.data
    ? statusPresentation(website.data?.status ?? wedding.data.status, website.data !== undefined, t)
    : null;

  useEffect(() => {
    if (!wedding.data) {
      setWeddingNavigation((current) => (current?.weddingId === weddingId ? null : current));
      return;
    }
    setWeddingNavigation((current) => {
      if (
        current?.weddingId === weddingId &&
        haveSameSidebarGroups(current.groups, sidebarGroups)
      ) {
        return current;
      }
      return { weddingId, groups: sidebarGroups };
    });
  }, [setWeddingNavigation, sidebarGroups, wedding.data, weddingId]);

  useEffect(
    () => () => {
      setWeddingNavigation((current) => (current?.weddingId === weddingId ? null : current));
    },
    [setWeddingNavigation, weddingId],
  );

  useEffect(() => {
    if (wedding.data) {
      const landingSection =
        available.find((section) => section.slug === "overview") ?? available[0];
      const href = landingSection ? `${weddingPath}/${landingSection.slug}` : undefined;
      setWedding((current) => {
        if (
          current?.id === wedding.data.id &&
          current.name === wedding.data.name &&
          current.status === wedding.data.status &&
          current.href === href
        ) {
          return current;
        }
        return {
          id: wedding.data.id,
          name: wedding.data.name,
          status: wedding.data.status,
          href,
        };
      });
      return;
    }
    setWedding((current) => (current?.id === weddingId ? null : current));
  }, [available, setWedding, wedding.data, weddingId, weddingPath]);

  return (
    <section aria-label={t("weddingInformation")} className="mb-6">
      <header className="flex flex-col gap-4 border-b border-border/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-petal text-primary-hover">
            <HeartHandshake className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("manageWedding")}
            </p>
            <h1 className="mt-1 truncate font-display text-xl tracking-tight text-foreground sm:text-2xl">
              {wedding.data?.name ?? (wedding.isError ? t("weddingFallback") : t("loadingWedding"))}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {status && (
                <span
                  className={cn(
                    "inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium",
                    status.className,
                  )}
                >
                  {status.label}
                </span>
              )}
              {wedding.data?.eventDateTime && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarHeart className="size-3.5" aria-hidden="true" />
                  {formatEventDate(wedding.data.eventDateTime, wedding.data.timeZoneId, language)}
                </span>
              )}
            </div>
          </div>
        </div>
        {isOwner && can("WEDDING_EDIT") && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              asChild
              variant="outline"
              className="min-h-10 rounded-xl border-border/90 bg-card"
            >
              <Link href={`${weddingPath}/website`}>
                <PanelsTopLeft aria-hidden="true" />
                {t("editWeddingWebsite")}
              </Link>
            </Button>
            {website.data?.status === "PUBLISHED" && wedding.data?.slug && (
              <Button asChild className="min-h-10 rounded-xl">
                <Link
                  href={`/wedding/${encodeURIComponent(wedding.data.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink aria-hidden="true" />
                  {t("openWeddingWebsite")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </header>
    </section>
  );
}
