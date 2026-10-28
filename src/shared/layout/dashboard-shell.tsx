"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Armchair,
  BadgeDollarSign,
  Bell,
  CalendarDays,
  CalendarHeart,
  ChevronRight,
  ClipboardCheck,
  Files,
  Gift,
  HeartHandshake,
  Home,
  LayoutDashboard,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { BrandLogo } from "@/shared/components/brand-logo";
import { LanguageSwitcher } from "@/shared/components/language-switcher";
import { useUiStore } from "@/shared/stores/ui.store";
import { cn } from "@/shared/lib/utils";
import { useTranslation } from "react-i18next";
import {
  WorkspaceContextProvider,
  useWorkspaceContext,
  type WorkspaceNavigationIcon,
} from "./workspace-context";

export type NavigationIcon = WorkspaceNavigationIcon;
export type NavigationItem = { href: string; label: string; icon: NavigationIcon };
export type NavigationGroup = { label: string; items: NavigationItem[] };

const navigationIcons: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  calendar: CalendarHeart,
  overview: LayoutDashboard,
  website: PanelsTopLeft,
  users: Users,
  weddings: UsersRound,
  templates: Files,
  permissions: ShieldCheck,
  audit: ScrollText,
  plans: BadgeDollarSign,
  invitations: Mail,
  rsvp: ClipboardCheck,
  reminders: Bell,
  waitlist: Users,
  seating: Armchair,
  checkin: ScanLine,
  gifts: Gift,
  "thank-you": HeartHandshake,
  analytics: CalendarDays,
  "co-hosts": UsersRound,
  settings: Settings,
  account: Settings,
};

const weddingRouteLabels: Record<string, string> = {
  overview: "Tổng quan",
  website: "Website đám cưới",
  guests: "Khách mời",
  invitations: "Thiệp mời",
  rsvp: "RSVP",
  "rsvp/reminders": "Nhắc RSVP",
  waitlist: "Danh sách chờ",
  seating: "Sơ đồ bàn",
  "check-in": "Check-in",
  gifts: "Quà mừng & lời chúc",
  "gift-desk": "Quầy ghi quà",
  "thank-you": "Thư cảm ơn",
  analytics: "Tổng quan check-in",
  "audit-logs": "Nhật ký hoạt động",
  settings: "Cài đặt đám cưới",
  "co-hosts": "Co-host",
};

function localizeNavigationLabel(label: string, t: (key: string) => string) {
  const translations: Record<string, string> = {
    "Không gian làm việc": t("workspace"),
    Workspace: t("workspace"),
    "Lễ cưới": t("weddings"),
    Weddings: t("weddings"),
    "Tất cả lễ cưới": t("allWeddings"),
    "Tổng quan": t("dashboard"),
    Dashboard: t("dashboard"),
    Overview: t("adminOverview"),
    Administration: t("management"),
    Management: t("management"),
    Security: t("security"),
    Users: t("users"),
    Templates: t("templates"),
    Plans: t("plans"),
    "Roles & permissions": t("rolesPermissions"),
    "Audit logs": t("auditLogs"),
    "Website đám cưới": t("weddingWebsite"),
    "Khách mời": t("guests"),
    "Thiệp mời": t("invitations"),
    "Nhắc RSVP": t("rsvpReminders"),
    "Danh sách chờ": t("waitlist"),
    "Sơ đồ bàn": t("seating"),
    "Check-in": t("checkIn"),
    "Quà mừng & lời chúc": t("gifts"),
    "Quầy ghi quà": t("giftDesk"),
    "Thư cảm ơn": t("thankYou"),
    "Tổng quan check-in": t("checkInOverview"),
    "Nhật ký hoạt động": t("activityHistory"),
    "Cài đặt đám cưới": t("weddingSettings"),
    "Cài đặt tài khoản": t("accountSettings"),
    "Không gian cưới": t("weddingSpace"),
    "Khách mời & RSVP": t("guestsAndRsvp"),
    "Tiệc cưới": t("reception"),
    "Quản lý": t("manage"),
  };
  return translations[label] ?? label;
}

function isActiveRoute(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin" || pathname === "/admin/dashboard";
  if (href === "/weddings") return pathname === "/weddings" || pathname === "/weddings/new";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function createBreadcrumbs(
  pathname: string,
  navigation: NavigationGroup[],
  title: string,
  homeHref: string,
  wedding: ReturnType<typeof useWorkspaceContext>["wedding"],
) {
  const weddingMatch = /^\/weddings\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (weddingMatch) {
    const rawWeddingId = weddingMatch[1];
    const rawSection = weddingMatch[2] ?? "overview";
    if (!rawWeddingId) return [{ label: title, href: "" }];
    const weddingId = decodeURIComponent(rawWeddingId);
    const weddingPath = `/weddings/${encodeURIComponent(weddingId)}`;
    const crumbs = [
      { label: "Lễ cưới", href: "/weddings" },
      {
        label: wedding?.id === weddingId ? wedding.name : "Wedding workspace",
        href: wedding?.id === weddingId ? wedding.href : undefined,
      },
    ];
    const section = decodeURIComponent(rawSection).replace(/\/$/, "");
    if (section !== "overview") {
      const parentSection = section.startsWith("rsvp/") ? "rsvp" : section;
      const parentLabel = weddingRouteLabels[parentSection];
      if (parentLabel && parentSection !== section) {
        crumbs.push({ label: parentLabel, href: `${weddingPath}/${parentSection}` });
      }
      crumbs.push({
        label: weddingRouteLabels[section] ?? "Wedding workspace",
        href: "",
      });
    } else {
      crumbs.push({ label: "Tổng quan", href: "" });
    }
    return crumbs;
  }

  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return [{ label: "Cài đặt tài khoản", href: "" }];
  }

  const items = navigation.flatMap((group) => group.items);
  const current = items
    .filter((item) => isActiveRoute(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length)[0];
  if (!current) return [{ label: title, href: "" }];
  if (pathname === current.href || current.href === homeHref) {
    return [{ label: current.label, href: "" }];
  }
  const homeItem = items.find((item) => item.href === homeHref);
  return [
    { label: homeItem?.label ?? title, href: homeHref },
    { label: current.label, href: "" },
  ];
}

function WorkspaceBreadcrumbs({
  pathname,
  navigation,
  title,
  homeHref,
}: {
  pathname: string;
  navigation: NavigationGroup[];
  title: string;
  homeHref: string;
}) {
  const { wedding } = useWorkspaceContext();
  const { t } = useTranslation("navigation");
  const crumbs = useMemo(
    () => createBreadcrumbs(pathname, navigation, title, homeHref, wedding),
    [homeHref, navigation, pathname, title, wedding],
  );

  return (
    <nav aria-label={t("crumbSeparator")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="hidden size-3.5 shrink-0 text-muted-foreground/70 sm:block"
                  aria-hidden="true"
                />
              )}
              {crumb.href && !current ? (
                <Link
                  href={crumb.href}
                  className="hidden shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline"
                >
                  {localizeNavigationLabel(crumb.label, t)}
                </Link>
              ) : (
                <span
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "min-w-0 truncate",
                    current ? "font-semibold text-foreground" : "text-muted-foreground sm:hidden",
                  )}
                  title={localizeNavigationLabel(crumb.label, t)}
                >
                  {localizeNavigationLabel(crumb.label, t)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DashboardShellFrame({
  children,
  navigation,
  account,
  title,
  homeHref,
}: {
  children: ReactNode;
  navigation: NavigationGroup[];
  account: ReactNode;
  title: string;
  homeHref: string;
}) {
  const { t } = useTranslation("navigation");
  const pathname = usePathname();
  const { wedding, weddingNavigation } = useWorkspaceContext();
  const localizedTitle = localizeNavigationLabel(title, t);
  const showSidebarTitle = !navigation.some(
    (group) =>
      localizeNavigationLabel(group.label, t).trim().toLocaleLowerCase() ===
      localizedTitle.trim().toLocaleLowerCase(),
  );
  const open = useUiStore((state) => state.sidebarOpen);
  const setOpen = useUiStore((state) => state.setSidebarOpen);
  const [collapsed, setCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const weddingRoute = /^\/weddings\/([^/]+)(?:\/|$)/.exec(pathname);
  const routeWeddingId =
    weddingRoute?.[1] && weddingRoute[1] !== "new" ? decodeURIComponent(weddingRoute[1]) : null;
  const contextualNavigation =
    routeWeddingId && weddingNavigation?.weddingId === routeWeddingId ? weddingNavigation : null;
  const contextualItems = contextualNavigation?.groups.flatMap((group) => group.items) ?? [];
  const contextualPathname =
    routeWeddingId && pathname === `/weddings/${encodeURIComponent(routeWeddingId)}`
      ? `/weddings/${encodeURIComponent(routeWeddingId)}/overview`
      : pathname;
  const activeContextHref = contextualItems
    .filter(
      (item) => contextualPathname === item.href || contextualPathname.startsWith(`${item.href}/`),
    )
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;

      const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not(:disabled)",
      );
      const visible = Array.from(focusable).filter(
        (element) => element.getClientRects().length > 0,
      );
      const first = visible[0];
      const last = visible.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <div
      className={cn(
        "min-h-screen md:grid",
        collapsed ? "md:grid-cols-[4.5rem_minmax(0,1fr)]" : "md:grid-cols-[17rem_minmax(0,1fr)]",
      )}
    >
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-foreground/30 backdrop-blur-[2px] md:hidden"
          aria-label={t("closeMenu")}
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        ref={sidebarRef}
        id="dashboard-navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={localizedTitle}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-border/80 bg-card px-4 py-4 shadow-xl transition-[transform,visibility,width] duration-200 motion-reduce:transition-none md:sticky md:top-0 md:z-auto md:h-screen md:w-auto md:translate-x-0 md:shadow-none",
          open
            ? "visible translate-x-0"
            : "invisible -translate-x-full md:visible md:translate-x-0",
          collapsed ? "md:px-2" : "md:px-5",
        )}
      >
        <div
          className={cn(
            "mb-8 flex min-h-11 items-center justify-between gap-2",
            collapsed && "md:justify-center",
          )}
        >
          <BrandLogo href={homeHref} size="md" markOnly={collapsed} />
          <div className="flex items-center gap-1">
            <Button
              ref={closeButtonRef}
              variant="ghost"
              size="icon"
              className="size-11 md:hidden"
              aria-label={t("closeMenu")}
              onClick={() => {
                setOpen(false);
                menuButtonRef.current?.focus();
              }}
            >
              <X aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden size-10 shrink-0 md:inline-flex"
              aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
              title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
              aria-expanded={!collapsed}
              aria-controls="dashboard-navigation"
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {showSidebarTitle && (
          <p
            className={cn(
              "mb-5 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
              collapsed && "md:sr-only",
            )}
          >
            {localizedTitle}
          </p>
        )}
        <nav
          aria-label={t("mainNavigation")}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-3"
        >
          {navigation.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2
                className={cn(
                  "mb-2 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                  collapsed && "md:sr-only",
                )}
              >
                {localizeNavigationLabel(group.label, t)}
              </h2>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActiveRoute(pathname, item.href);
                  const Icon = navigationIcons[item.icon];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? localizeNavigationLabel(item.label, t) : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-xl border-l-2 border-transparent px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "md:justify-start",
                        collapsed && "md:justify-center md:border-l-0 md:px-0",
                        active
                          ? "border-primary-hover bg-petal font-semibold text-primary-hover"
                          : "text-foreground hover:bg-petal/80 hover:text-primary-hover",
                      )}
                    >
                      <Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />
                      <span className={cn(collapsed && "md:sr-only")}>
                        {localizeNavigationLabel(item.label, t)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          {routeWeddingId && (
            <section aria-label={t("weddingSections")}>
              <h2
                className={cn(
                  "mb-2 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                  collapsed && "md:sr-only",
                )}
              >
                {t("manageWedding")}
              </h2>
              <div className="mb-2 rounded-xl bg-background px-3 py-2.5">
                <p
                  className={cn(
                    "truncate text-sm font-semibold text-foreground",
                    collapsed && "md:sr-only",
                  )}
                >
                  {wedding?.id === routeWeddingId ? wedding.name : t("loadingWedding")}
                </p>
                <Link
                  href="/weddings"
                  title={collapsed ? t("allWeddings") : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "mt-1 inline-flex min-h-8 items-center text-xs font-medium text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed && "md:sr-only",
                  )}
                >
                  ← {t("allWeddings")}
                </Link>
              </div>
              {contextualNavigation ? (
                <div className="space-y-5">
                  {contextualNavigation.groups.map((group) => (
                    <section key={group.label} aria-label={group.label}>
                      <h3
                        className={cn(
                          "mb-2 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                          collapsed && "md:sr-only",
                        )}
                      >
                        {group.label}
                      </h3>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const Icon = navigationIcons[item.icon];
                          const active = activeContextHref === item.href;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              title={collapsed ? localizeNavigationLabel(item.label, t) : undefined}
                              onClick={() => setOpen(false)}
                              className={cn(
                                "flex min-h-11 items-center gap-3 rounded-xl border-l-2 border-transparent px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                collapsed && "md:justify-center md:border-l-0 md:px-0",
                                active
                                  ? "border-primary-hover bg-petal font-semibold text-primary-hover"
                                  : "text-foreground hover:bg-petal/80 hover:text-primary-hover",
                              )}
                            >
                              <Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />
                              <span className={cn("truncate", collapsed && "md:sr-only")}>
                                {localizeNavigationLabel(item.label, t)}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div role="status" className="space-y-2 px-2 py-1">
                  <span className="sr-only">{t("loadingWeddingAccess")}</span>
                  <div className="h-10 animate-pulse rounded-xl bg-petal motion-reduce:animate-none" />
                  <div className="h-10 w-4/5 animate-pulse rounded-xl bg-petal motion-reduce:animate-none" />
                </div>
              )}
            </section>
          )}
        </nav>
        <div className="mt-3 border-t border-border/80 pt-3">
          <Link
            href="/"
            title={collapsed ? t("home") : undefined}
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-foreground transition-colors hover:bg-petal/80 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              collapsed && "md:justify-center md:px-0",
            )}
          >
            <Home className="size-[1.125rem] shrink-0" aria-hidden="true" />
            <span className={cn(collapsed && "md:sr-only")}>{t("home")}</span>
          </Link>
          <div className="mb-2 px-1 sm:hidden">
            <LanguageSwitcher className="w-full" />
          </div>
          <Link
            href="/account"
            aria-current={isActiveRoute(pathname, "/account") ? "page" : undefined}
            title={collapsed ? t("accountSettings") : undefined}
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl border-l-2 border-transparent px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              collapsed && "md:justify-center md:border-l-0 md:px-0",
              isActiveRoute(pathname, "/account")
                ? "border-primary-hover bg-petal font-semibold text-primary-hover"
                : "text-foreground hover:bg-petal/80 hover:text-primary-hover",
            )}
          >
            <Settings className="size-[1.125rem] shrink-0" aria-hidden="true" />
            <span className={cn(collapsed && "md:sr-only")}>{t("accountSettings")}</span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-3 backdrop-blur sm:px-5 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 md:hidden"
              aria-label={t("openMenu")}
              aria-expanded={open}
              aria-controls="dashboard-navigation"
              onClick={() => setOpen(true)}
            >
              <Menu aria-hidden="true" />
            </Button>
            <BrandLogo href={homeHref} size="sm" markOnly className="shrink-0 sm:hidden" />
            <WorkspaceBreadcrumbs
              pathname={pathname}
              navigation={navigation}
              title={title}
              homeHref={homeHref}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            {account}
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto min-h-[calc(100svh-4rem)] max-w-[1600px] p-4 sm:p-6 lg:p-8 xl:p-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({
  children,
  navigation,
  account,
  title = "Wedding workspace",
  homeHref = "/dashboard",
}: {
  children: ReactNode;
  navigation: NavigationGroup[];
  account: ReactNode;
  title?: string;
  homeHref?: string;
}) {
  return (
    <WorkspaceContextProvider>
      <DashboardShellFrame
        navigation={navigation}
        account={account}
        title={title}
        homeHref={homeHref}
      >
        {children}
      </DashboardShellFrame>
    </WorkspaceContextProvider>
  );
}
